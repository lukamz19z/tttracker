import { Ionicons } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { useAccess } from "@/lib/access";
import {
  cacheSitePrestartBootstrap,
  cacheSitePrestartDetail,
  cacheSitePrestartRegister,
  cachedSitePrestartBootstrap,
  cachedSitePrestartDetail,
  cachedSitePrestartRegister,
  loadPendingSitePrestartSignatures,
  queueSitePrestartSignature,
  readSitePrestartJson,
  removePendingSitePrestartSignature,
  sitePrestartApi,
  syncPendingSitePrestartSignatures,
  type PendingSitePrestartSignature,
} from "@/lib/site-prestarts-api";

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_folder_id: string | null;
};

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type Prestart = {
  id: string;
  prestart_number: string;
  project_id: string;
  project_name?: string | null;
  project_number?: string | null;
  prestart_date: string;
  location: string;
  conducted_by_name: string;
  current_revision: number;
  admin_notes: string | null;
  status: "draft" | "completed" | "void";
  completed_at: string | null;
  sharepoint_web_url: string | null;
};

type Revision = {
  id: string;
  revision_no: number;
  discussion_points: string;
  revision_note: string | null;
  created_by_name: string;
  created_at: string;
};

type SignaturePoint = {
  x: number;
  y: number;
};

type SignatureStroke = SignaturePoint[];

type Attendee = {
  id: string;
  prestart_id: string;
  discussion_revision_no: number;
  employee_id: string;
  employee_name: string;
  payroll_id: string | null;
  breathalyser_reading: number | string | null;
  declaration_text: string;
  declaration_accepted: boolean;
  signature_strokes: SignatureStroke[];
  signed_at: string;
};

type DetailPayload = {
  prestart: Prestart;
  revisions: Revision[];
  attendees: Attendee[];
};

type BootstrapPayload = {
  projects: Project[];
  employees: Employee[];
  declaration: string;
};

type RegisterPayload = {
  prestarts: (Prestart & {
    attendee_count?: number;
  })[];
};

const PAD_WIDTH = 320;
const PAD_HEIGHT = 140;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function localDate() {
  const now = new Date();

  return [
    String(now.getDate()).padStart(2, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    now.getFullYear(),
  ].join("/");
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function displayDateToApiDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function formatDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const isoDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${day}/${month}/${year}`;
  }

  const displayDateMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (displayDateMatch) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function projectLabel(project?: Project | null) {
  if (!project) return "Select project";

  return [clean(project.project_number), clean(project.name)]
    .filter(Boolean)
    .join(" — ");
}

function prestartProjectLabel(prestart: Prestart) {
  return [clean(prestart.project_number), clean(prestart.project_name)]
    .filter(Boolean)
    .join(" — ");
}

function breathDisplay(value: unknown) {
  if (value === null || value === undefined || clean(value) === "") {
    return "N/A";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(3) : clean(value);
}

export default function SitePrestartScreen() {
  const { profile } = useAuth();
  const { online } = useSync();
  const { can } = useAccess();
  const canUseSitePrestart = can("mobile.site_prestarts");

  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [declaration, setDeclaration] = useState("");

  const [drafts, setDrafts] = useState<Prestart[]>([]);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [pendingSignatures, setPendingSignatures] = useState<
    PendingSitePrestartSignature[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectId, setProjectId] = useState(profile?.projectId ?? "");
  const [prestartDate, setPrestartDate] = useState(localDate());
  const [location, setLocation] = useState("");
  const [discussionPoints, setDiscussionPoints] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  const [notesDraft, setNotesDraft] = useState("");
  const [revisionDraft, setRevisionDraft] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);
  const [breathalyserReading, setBreathalyserReading] = useState("");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [signatureStrokes, setSignatureStrokes] = useState<
    SignatureStroke[]
  >([]);
  const [signaturePadActive, setSignaturePadActive] = useState(false);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();

    const rows = !query
      ? projects
      : projects.filter((project) =>
          [
            project.project_number,
            project.name,
            project.status,
          ]
            .map(clean)
            .join(" ")
            .toLowerCase()
            .includes(query),
        );

    return rows.slice(0, 8);
  }, [projectSearch, projects]);

  const selectedProject = projects.find(
    (project) => project.id === projectId,
  );

  const active = detail?.prestart ?? null;

  const currentRevision = useMemo(() => {
    if (!detail) return null;

    return detail.revisions.find(
      (revision) =>
        Number(revision.revision_no) ===
        Number(detail.prestart.current_revision),
    ) ?? null;
  }, [detail]);

  const pendingForActive = useMemo(() => {
    if (!active) return [];
    return pendingSignatures.filter(
      (row) =>
        row.prestartId === active.id &&
        row.revisionNo === Number(active.current_revision),
    );
  }, [active, pendingSignatures]);

  const mergedAttendees = useMemo<Attendee[]>(() => {
    if (!detail) return [];

    const byKey = new Map<string, Attendee>();
    for (const attendee of detail.attendees) {
      byKey.set(
        `${attendee.employee_id}::${attendee.discussion_revision_no}`,
        attendee,
      );
    }

    for (const pending of pendingSignatures) {
      if (pending.prestartId !== detail.prestart.id) continue;
      const key = `${pending.employee.id}::${pending.revisionNo}`;
      if (byKey.has(key)) continue;

      byKey.set(key, {
        id: `local:${pending.id}`,
        prestart_id: pending.prestartId,
        discussion_revision_no: pending.revisionNo,
        employee_id: pending.employee.id,
        employee_name: pending.employee.fullName,
        payroll_id: pending.employee.payrollId,
        breathalyser_reading: pending.breathalyserReading,
        declaration_text: pending.declarationText,
        declaration_accepted: true,
        signature_strokes: pending.signatureStrokes,
        signed_at: pending.signedAt,
      });
    }

    return Array.from(byKey.values());
  }, [detail, pendingSignatures]);

  const currentAttendees = useMemo(() => {
    if (!detail) return [];

    return mergedAttendees.filter(
      (attendee) =>
        Number(attendee.discussion_revision_no) ===
        Number(detail.prestart.current_revision),
    );
  }, [detail, mergedAttendees]);

  const signedCurrentIds = useMemo(
    () => new Set(currentAttendees.map((attendee) => attendee.employee_id)),
    [currentAttendees],
  );

  const needsResign = useMemo(() => {
    if (!detail) return [];

    const all = new Map<string, string>();

    for (const attendee of mergedAttendees) {
      all.set(attendee.employee_id, attendee.employee_name);
    }

    return Array.from(all.entries())
      .filter(([employeeId]) => !signedCurrentIds.has(employeeId))
      .map(([employeeId, employeeName]) => ({
        employeeId,
        employeeName,
      }));
  }, [detail, mergedAttendees, signedCurrentIds]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();

    if (!query) return [];

    return employees
      .filter((employee) =>
        [
          employee.full_name,
          employee.payroll_id,
          employee.role,
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 12);
  }, [employeeSearch, employees]);

  const applyBootstrap = useCallback(
    (bootstrap: BootstrapPayload, register: RegisterPayload) => {
      setProjects(bootstrap.projects ?? []);
      setEmployees(bootstrap.employees ?? []);
      setDeclaration(bootstrap.declaration ?? "");

      const nextDrafts = (register.prestarts ?? [])
        .filter((row) => row.status === "draft")
        .slice(0, 12);
      setDrafts(nextDrafts);

      setProjectId((current) => {
        if (current) return current;

        const profileProjectId = profile?.projectId ?? "";
        if (
          profileProjectId &&
          bootstrap.projects.some(
            (project) => project.id === profileProjectId,
          )
        ) {
          return profileProjectId;
        }

        return bootstrap.projects[0]?.id ?? "";
      });
    },
    [profile?.projectId],
  );

  const loadBootstrap = useCallback(async () => {
    const [cachedBootstrap, cachedRegister] = await Promise.all([
      cachedSitePrestartBootstrap<BootstrapPayload>(),
      cachedSitePrestartRegister<RegisterPayload>(),
    ]);

    if (cachedBootstrap?.value && cachedRegister?.value) {
      applyBootstrap(cachedBootstrap.value, cachedRegister.value);
    }

    if (!online) {
      if (!cachedBootstrap?.value || !cachedRegister?.value) {
        throw new Error(
          "Site Prestart data has not been cached on this device yet. Connect once to download the employee and draft registers.",
        );
      }
      return;
    }

    const [bootstrapResponse, registerResponse] = await Promise.all([
      sitePrestartApi("/api/site-prestarts/bootstrap"),
      sitePrestartApi("/api/site-prestarts"),
    ]);

    const bootstrap = await readSitePrestartJson<BootstrapPayload>(
      bootstrapResponse,
      "Site Prestart setup could not be loaded.",
    );
    const register = await readSitePrestartJson<RegisterPayload>(
      registerResponse,
      "Site Prestart drafts could not be loaded.",
    );

    await Promise.all([
      cacheSitePrestartBootstrap(bootstrap),
      cacheSitePrestartRegister(register),
    ]);
    applyBootstrap(bootstrap, register);
  }, [applyBootstrap, online]);

  const applyDetail = useCallback((payload: DetailPayload) => {
    setDetail(payload);
    setNotesDraft(clean(payload.prestart.admin_notes));
    setRevisionDraft(
      clean(
        payload.revisions.find(
          (revision) =>
            Number(revision.revision_no) ===
            Number(payload.prestart.current_revision),
        )?.discussion_points,
      ),
    );
  }, []);

  const loadDetail = useCallback(
    async (prestartId: string) => {
      const cached = await cachedSitePrestartDetail<DetailPayload>(prestartId);
      if (cached?.value) applyDetail(cached.value);

      if (!online) {
        if (!cached?.value) {
          throw new Error(
            "This Site Prestart has not been opened on this device before, so its detail is not available offline.",
          );
        }
        return cached.value;
      }

      const response = await sitePrestartApi(
        `/api/site-prestarts/${encodeURIComponent(prestartId)}`,
      );
      const payload = await readSitePrestartJson<DetailPayload>(
        response,
        "Site Prestart could not be loaded.",
      );

      await cacheSitePrestartDetail(prestartId, payload);
      applyDetail(payload);
      return payload;
    },
    [applyDetail, online],
  );

  useEffect(() => {
    if (!canUseSitePrestart) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        await loadBootstrap();
      } catch (error) {
        Alert.alert(
          "Could not load Site Prestarts",
          error instanceof Error
            ? error.message
            : "Please try again.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [canUseSitePrestart, loadBootstrap]);

  useEffect(() => {
    if (!canUseSitePrestart) return;

    let activeEffect = true;

    void (async () => {
      const queued = await loadPendingSitePrestartSignatures();
      if (activeEffect) setPendingSignatures(queued);

      if (!online || queued.length === 0) return;

      const result = await syncPendingSitePrestartSignatures();
      if (!activeEffect) return;

      setPendingSignatures(result.rows);
      if (result.synced > 0 && detail?.prestart.id) {
        try {
          await loadDetail(detail.prestart.id);
        } catch {
          // Keep cached/optimistic detail if the refresh cannot complete.
        }
      }
    })();

    return () => {
      activeEffect = false;
    };
  }, [canUseSitePrestart, detail?.prestart.id, loadDetail, online]);

  async function refresh() {
    setRefreshing(true);

    try {
      await loadBootstrap();

      if (active?.id) {
        await loadDetail(active.id);
      }
    } catch (error) {
      Alert.alert(
        "Could not refresh",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function startPrestart() {
    if (!online) {
      Alert.alert(
        "Connection required",
        "Starting a brand-new Site Prestart still requires a connection. Existing cached drafts can be opened and employees can sign them offline.",
      );
      return;
    }

    if (!projectId) {
      Alert.alert("Project required", "Select the project first.");
      return;
    }

    if (!location.trim()) {
      Alert.alert(
        "Location required",
        "Enter the site, compound or work location.",
      );
      return;
    }

    if (!discussionPoints.trim()) {
      Alert.alert(
        "Discussion points required",
        "Enter the topics discussed before starting the prestart.",
      );
      return;
    }

    const apiPrestartDate = displayDateToApiDate(prestartDate);

    if (!apiPrestartDate) {
      Alert.alert(
        "Invalid date",
        "Enter the date in DD/MM/YYYY format, for example 18/09/2026.",
      );
      return;
    }

    setBusy(true);

    try {
      const response = await sitePrestartApi("/api/site-prestarts", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          prestartDate: apiPrestartDate,
          location: location.trim(),
          discussionPoints: discussionPoints.trim(),
          adminNotes: adminNotes.trim(),
        }),
      });

      const payload = await readSitePrestartJson<{
        prestart: Prestart;
      }>(response, "Site Prestart could not be created.");

      await loadDetail(payload.prestart.id);
      await loadBootstrap();

      setDiscussionPoints("");
      setAdminNotes("");
      setEmployeeSearch("");

      Alert.alert(
        "Site Prestart started",
        `${payload.prestart.prestart_number} is ready for employee sign-on.`,
      );
    } catch (error) {
      Alert.alert(
        "Could not start prestart",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resumeDraft(prestartId: string) {
    setBusy(true);

    try {
      await loadDetail(prestartId);
      setEmployeeSearch("");
    } catch (error) {
      Alert.alert(
        "Could not open draft",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function closeActive() {
    setDetail(null);
    setSelectedEmployee(null);
    setEmployeeSearch("");
    setSignatureStrokes([]);
    setSignaturePadActive(false);
    setDeclarationAccepted(false);
    setBreathalyserReading("");
  }

  async function saveNotes() {
    if (!active) return;

    setBusy(true);

    try {
      const response = await sitePrestartApi(
        `/api/site-prestarts/${encodeURIComponent(active.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            adminNotes: notesDraft.trim(),
          }),
        },
      );

      await readSitePrestartJson(
        response,
        "Site notes could not be saved.",
      );

      await loadDetail(active.id);
      Alert.alert("Notes saved", "Site / admin notes have been updated.");
    } catch (error) {
      Alert.alert(
        "Could not save notes",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openRevision() {
    if (!active || !currentRevision) return;

    setRevisionDraft(currentRevision.discussion_points);
    setRevisionNote("");
    setRevisionModalOpen(true);
  }

  async function saveRevision() {
    if (!active) return;

    if (!revisionDraft.trim()) {
      Alert.alert(
        "Discussion points required",
        "Enter the revised discussion points.",
      );
      return;
    }

    const continueSave = async () => {
      setBusy(true);

      try {
        const response = await sitePrestartApi(
          `/api/site-prestarts/${encodeURIComponent(
            active.id,
          )}/discussion`,
          {
            method: "POST",
            body: JSON.stringify({
              discussionPoints: revisionDraft.trim(),
              revisionNote: revisionNote.trim(),
              adminNotes: notesDraft.trim(),
            }),
          },
        );

        const payload = await readSitePrestartJson<{
          revisionChanged: boolean;
          message?: string;
        }>(response, "Discussion points could not be revised.");

        setRevisionModalOpen(false);
        await loadDetail(active.id);

        Alert.alert(
          payload.revisionChanged
            ? "New discussion revision created"
            : "Discussion unchanged",
          payload.message ||
            "The current discussion information has been saved.",
        );
      } catch (error) {
        Alert.alert(
          "Could not revise discussion",
          error instanceof Error ? error.message : "Please try again.",
        );
      } finally {
        setBusy(false);
      }
    };

    if (currentAttendees.length > 0) {
      Alert.alert(
        "Employees must re-sign",
        `There are ${currentAttendees.length} employee signature${
          currentAttendees.length === 1 ? "" : "s"
        } on Revision ${active.current_revision}. Changing the discussion points creates a new revision, and those employees must acknowledge it again before the prestart can be completed.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Create Revision",
            style: "destructive",
            onPress: () => void continueSave(),
          },
        ],
      );

      return;
    }

    await continueSave();
  }

  function chooseEmployee(employee: Employee) {
    if (signedCurrentIds.has(employee.id)) {
      Alert.alert(
        "Already signed",
        `${employee.full_name} has already signed Revision ${
          active?.current_revision ?? ""
        }.`,
      );
      return;
    }

    setSelectedEmployee(employee);
    setEmployeeSearch("");
    setBreathalyserReading("");
    setDeclarationAccepted(false);
    setSignatureStrokes([]);
    setSignaturePadActive(false);
  }

  function cancelSigner() {
    setSelectedEmployee(null);
    setBreathalyserReading("");
    setDeclarationAccepted(false);
    setSignatureStrokes([]);
    setSignaturePadActive(false);
  }

  async function saveSigner() {
    if (!active || !selectedEmployee) return;

    const bacText = breathalyserReading.trim();
    const bacValue = Number(bacText);

    if (!bacText) {
      Alert.alert(
        "BAC reading required",
        "Enter the employee's BAC reading before saving. Enter 0.000 when no alcohol is detected.",
      );
      return;
    }

    if (!Number.isFinite(bacValue) || bacValue < 0) {
      Alert.alert(
        "Invalid BAC reading",
        "Enter a valid non-negative BAC reading, for example 0.000.",
      );
      return;
    }

    if (!declarationAccepted) {
      Alert.alert(
        "Declaration required",
        "The employee must confirm the declaration before signing.",
      );
      return;
    }

    if (signatureStrokes.length === 0) {
      Alert.alert(
        "Signature required",
        "The employee must sign before the record can be saved.",
      );
      return;
    }

    setBusy(true);

    const employee = selectedEmployee;
    const signedAt = new Date().toISOString();
    const pendingInput = {
      prestartId: active.id,
      revisionNo: Number(active.current_revision),
      employee: {
        id: employee.id,
        fullName: employee.full_name,
        payrollId: clean(employee.payroll_id) || null,
      },
      breathalyserReading: bacText,
      declarationText: declaration,
      signatureStrokes,
      signatureWidth: PAD_WIDTH,
      signatureHeight: PAD_HEIGHT,
      signedAt,
    };

    try {
      if (online) {
        let response: Response | null = null;

        try {
          response = await sitePrestartApi(
            `/api/site-prestarts/${encodeURIComponent(active.id)}/attendees`,
            {
              method: "POST",
              body: JSON.stringify({
                employeeId: employee.id,
                breathalyserReading: pendingInput.breathalyserReading,
                declarationAccepted: true,
                signatureStrokes,
                signatureWidth: PAD_WIDTH,
                signatureHeight: PAD_HEIGHT,
                signedAt,
                discussionRevisionNo: Number(active.current_revision),
              }),
            },
          );
        } catch {
          // No usable connection: preserve the signed acknowledgement locally.
        }

        if (response) {
          // A server validation / conflict response must be shown to the user,
          // not silently converted into an offline queue item.
          await readSitePrestartJson(
            response,
            "Employee signature could not be saved.",
          );

          cancelSigner();
          await loadDetail(active.id);

          Alert.alert(
            "Signed",
            `${employee.full_name} has been added to ${active.prestart_number}.`,
          );
          return;
        }
      }

      await queueSitePrestartSignature(pendingInput);
      setPendingSignatures(await loadPendingSitePrestartSignatures());
      cancelSigner();

      Alert.alert(
        "Signature saved offline",
        `${employee.full_name}'s signature is stored on this device and will upload when TTTracker reconnects.`,
      );
    } catch (error) {
      Alert.alert(
        "Could not save signature",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAttendee(attendee: Attendee) {
    if (!active) return;

    if (attendee.id.startsWith("local:")) {
      const pendingId = attendee.id.slice("local:".length);
      await removePendingSitePrestartSignature(pendingId);
      setPendingSignatures(await loadPendingSitePrestartSignatures());
      return;
    }

    if (!online) {
      Alert.alert(
        "Connection required",
        "This signature is already synced to TTTracker. Reconnect before removing it.",
      );
      return;
    }

    Alert.alert(
      "Remove signature?",
      `Remove ${attendee.employee_name} from Revision ${attendee.discussion_revision_no}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void (async () => {
              setBusy(true);

              try {
                const response = await sitePrestartApi(
                  `/api/site-prestarts/${encodeURIComponent(
                    active.id,
                  )}/attendees?attendeeId=${encodeURIComponent(
                    attendee.id,
                  )}`,
                  {
                    method: "DELETE",
                  },
                );

                await readSitePrestartJson(
                  response,
                  "Employee signature could not be removed.",
                );

                await loadDetail(active.id);
              } catch (error) {
                Alert.alert(
                  "Could not remove signature",
                  error instanceof Error
                    ? error.message
                    : "Please try again.",
                );
              } finally {
                setBusy(false);
              }
            })(),
        },
      ],
    );
  }

  async function completePrestart() {
    if (!active) return;

    if (!online) {
      Alert.alert(
        "Connection required",
        "Completing a Site Prestart requires a connection because TTTracker generates the controlled PDF and publishes it to SharePoint.",
      );
      return;
    }

    if (pendingForActive.length > 0) {
      Alert.alert(
        "Signatures still pending upload",
        `${pendingForActive.length} employee signature${
          pendingForActive.length === 1 ? " is" : "s are"
        } still stored on this device. Wait for them to upload before completing the prestart.`,
      );
      return;
    }

    if (currentAttendees.length === 0) {
      Alert.alert(
        "No signatures",
        "At least one employee must sign the current discussion revision.",
      );
      return;
    }

    if (needsResign.length > 0) {
      Alert.alert(
        "Current revision not acknowledged",
        `${needsResign
          .map((item) => item.employeeName)
          .join(
            ", ",
          )} must sign Revision ${active.current_revision} before completion.`,
      );
      return;
    }

    Alert.alert(
      "Complete Site Prestart?",
      `This will lock ${active.prestart_number}, generate the signed PDF and save it to the project's SharePoint HSEQ / Prestarts folder.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete & Publish",
          onPress: () =>
            void (async () => {
              setBusy(true);

              try {
                const response = await sitePrestartApi(
                  `/api/site-prestarts/${encodeURIComponent(
                    active.id,
                  )}/complete`,
                  {
                    method: "POST",
                  },
                );

                const payload = await readSitePrestartJson<{
                  prestart: Prestart;
                  pdf?: {
                    webUrl?: string | null;
                    fileName?: string;
                  };
                }>(
                  response,
                  "Site Prestart could not be completed.",
                );

                await loadBootstrap();
                setDetail(null);

                Alert.alert(
                  "Site Prestart completed",
                  `${payload.prestart.prestart_number} has been saved to the register and published to SharePoint.`,
                  payload.pdf?.webUrl
                    ? [
                        { text: "Close" },
                        {
                          text: "Open PDF",
                          onPress: () =>
                            void Linking.openURL(
                              String(payload.pdf?.webUrl),
                            ),
                        },
                      ]
                    : [{ text: "Close" }],
                );
              } catch (error) {
                Alert.alert(
                  "Could not complete prestart",
                  error instanceof Error
                    ? error.message
                    : "Please try again.",
                );
              } finally {
                setBusy(false);
              }
            })(),
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>
            Loading Site Prestarts…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!canUseSitePrestart) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.accessCard}>
          <Ionicons
            name="lock-closed-outline"
            size={34}
            color="#B45309"
          />
          <Text style={styles.accessTitle}>
            Site Prestart access required
          </Text>
          <Text style={styles.accessText}>
            Your account does not currently have the mobile.site_prestarts
            permission. Access is controlled dynamically in TTTracker Admin,
            not by a hard-coded mobile role.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (active && detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!signaturePadActive}
            bounces={!signaturePadActive}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
              />
            }
          >
            <View style={styles.headerRow}>
              <View style={styles.flex}>
                <Text style={styles.eyebrow}>SITE PRESTART</Text>
                <Text style={styles.title}>
                  {active.prestart_number}
                </Text>
                <Text style={styles.subtitle}>
                  {prestartProjectLabel(active)} · {active.location}
                </Text>
              </View>

              <Pressable
                style={styles.iconButton}
                onPress={closeActive}
                disabled={busy}
              >
                <Ionicons
                  name="close"
                  size={21}
                  color="#334155"
                />
              </Pressable>
            </View>

            <View style={styles.summaryRow}>
              <SummaryChip
                label="Date"
                value={formatDate(active.prestart_date)}
              />
              <SummaryChip
                label="Discussion"
                value={`R${active.current_revision}`}
              />
              <SummaryChip
                label="Signed"
                value={String(currentAttendees.length)}
              />
            </View>

            <Section title={`Discussion Points — R${active.current_revision}`}>
              <Text style={styles.bodyText}>
                {currentRevision?.discussion_points ||
                  "Discussion points unavailable."}
              </Text>

              <Pressable
                style={styles.outlineButton}
                onPress={openRevision}
                disabled={busy}
              >
                <Ionicons
                  name="create-outline"
                  size={17}
                  color="#1D4ED8"
                />
                <Text style={styles.outlineButtonText}>
                  Revise Discussion Points
                </Text>
              </Pressable>
            </Section>

            <Section title="Site / Admin Notes">
              <Text style={styles.helper}>
                Notes can be updated without invalidating signatures.
                Only changing the actual discussion points creates a new
                revision.
              </Text>

              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                style={styles.textArea}
                placeholder="Add site notes, follow-ups or points to revisit…"
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
              />

              <Pressable
                style={styles.outlineButton}
                onPress={() => void saveNotes()}
                disabled={busy}
              >
                <Ionicons
                  name="save-outline"
                  size={17}
                  color="#1D4ED8"
                />
                <Text style={styles.outlineButtonText}>Save Notes</Text>
              </Pressable>
            </Section>

            {needsResign.length > 0 ? (
              <View style={styles.warningCard}>
                <Ionicons
                  name="warning-outline"
                  size={21}
                  color="#B45309"
                />
                <View style={styles.flex}>
                  <Text style={styles.warningTitle}>
                    Re-sign required for Revision {active.current_revision}
                  </Text>
                  <Text style={styles.warningText}>
                    {needsResign
                      .map((item) => item.employeeName)
                      .join(", ")}
                  </Text>
                </View>
              </View>
            ) : null}

            {selectedEmployee ? (
              <Section title="Employee Declaration & Signature">
                <View style={styles.selectedEmployeeCard}>
                  <View style={styles.flex}>
                    <Text style={styles.selectedEmployeeName}>
                      {selectedEmployee.full_name}
                    </Text>
                    <Text style={styles.selectedEmployeeMeta}>
                      {clean(selectedEmployee.payroll_id) ||
                        "No payroll ID"}
                      {clean(selectedEmployee.role)
                        ? ` · ${selectedEmployee.role}`
                        : ""}
                    </Text>
                  </View>

                  <Pressable
                    onPress={cancelSigner}
                    disabled={busy}
                    style={styles.smallIconButton}
                  >
                    <Ionicons
                      name="close"
                      size={18}
                      color="#475569"
                    />
                  </Pressable>
                </View>

                <Text style={styles.fieldLabel}>BAC reading *</Text>
                <TextInput
                  value={breathalyserReading}
                  onChangeText={(value) => {
                    const cleaned = value.replace(/[^0-9.]/g, "");
                    const decimalCount = (cleaned.match(/\./g) ?? []).length;
                    if (decimalCount <= 1) setBreathalyserReading(cleaned);
                  }}
                  onBlur={() => {
                    const value = breathalyserReading.trim();
                    if (!value) return;
                    const parsed = Number(value);
                    if (Number.isFinite(parsed) && parsed >= 0) {
                      setBreathalyserReading(parsed.toFixed(3));
                    }
                  }}
                  style={styles.input}
                  placeholder="0.000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.helper}>
                  Required. Enter 0.000 when no alcohol is detected.
                </Text>

                <Pressable
                  style={[
                    styles.declarationCard,
                    declarationAccepted &&
                      styles.declarationCardAccepted,
                  ]}
                  onPress={() =>
                    setDeclarationAccepted((current) => !current)
                  }
                >
                  <Ionicons
                    name={
                      declarationAccepted
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={24}
                    color={
                      declarationAccepted ? "#15803D" : "#64748B"
                    }
                  />
                  <Text style={styles.declarationText}>
                    {declaration}
                  </Text>
                </Pressable>

                <Text style={styles.fieldLabel}>Signature</Text>
                <SignaturePad
                  strokes={signatureStrokes}
                  onChange={setSignatureStrokes}
                  onInteractionChange={setSignaturePadActive}
                  disabled={busy}
                />

                <View style={styles.buttonRow}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => setSignatureStrokes([])}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Clear Signature
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.primaryButton,
                      (!breathalyserReading.trim() ||
                        !Number.isFinite(Number(breathalyserReading)) ||
                        Number(breathalyserReading) < 0 ||
                        !declarationAccepted ||
                        signatureStrokes.length === 0 ||
                        busy) &&
                        styles.disabledButton,
                    ]}
                    onPress={() => void saveSigner()}
                    disabled={
                      !breathalyserReading.trim() ||
                      !Number.isFinite(Number(breathalyserReading)) ||
                      Number(breathalyserReading) < 0 ||
                      !declarationAccepted ||
                      signatureStrokes.length === 0 ||
                      busy
                    }
                  >
                    {busy ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : (
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                    )}
                    <Text style={styles.primaryButtonText}>
                      Save Employee
                    </Text>
                  </Pressable>
                </View>
              </Section>
            ) : (
              <Section title="Add Employee">
                <Text style={styles.helper}>
                  Hand the device to the employee. They search their name,
                  read the declaration and sign. The employee register is
                  cached on this device, so search and signing still work
                  without reception.
                </Text>

                <View style={styles.searchWrap}>
                  <Ionicons
                    name="search-outline"
                    size={18}
                    color="#64748B"
                  />
                  <TextInput
                    value={employeeSearch}
                    onChangeText={setEmployeeSearch}
                    style={styles.searchInput}
                    placeholder="Search employee name or payroll ID…"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="words"
                  />
                </View>

                {filteredEmployees.length > 0 ? (
                  <View style={styles.searchResults}>
                    {filteredEmployees.map((employee) => {
                      const signed = signedCurrentIds.has(employee.id);

                      return (
                        <Pressable
                          key={employee.id}
                          style={[
                            styles.employeeRow,
                            signed && styles.employeeRowSigned,
                          ]}
                          onPress={() => chooseEmployee(employee)}
                        >
                          <View style={styles.flex}>
                            <Text style={styles.employeeName}>
                              {employee.full_name}
                            </Text>
                            <Text style={styles.employeeMeta}>
                              {clean(employee.payroll_id) ||
                                "No payroll ID"}
                              {clean(employee.role)
                                ? ` · ${employee.role}`
                                : ""}
                            </Text>
                          </View>

                          {signed ? (
                            <View style={styles.signedBadge}>
                              <Text style={styles.signedBadgeText}>
                                Signed
                              </Text>
                            </View>
                          ) : (
                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color="#94A3B8"
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </Section>
            )}

            <Section title={`Current Signatures (${currentAttendees.length})`}>
              {currentAttendees.length === 0 ? (
                <Text style={styles.emptyText}>
                  No employees have signed the current revision yet.
                </Text>
              ) : (
                <View style={styles.attendeeList}>
                  {currentAttendees.map((attendee) => (
                    <View
                      key={attendee.id}
                      style={styles.attendeeRow}
                    >
                      <View style={styles.flex}>
                        <Text style={styles.employeeName}>
                          {attendee.employee_name}
                        </Text>
                        <Text style={styles.employeeMeta}>
                          {clean(attendee.payroll_id) ||
                            "No payroll ID"}
                          {" · "}
                          Breathalyser{" "}
                          {breathDisplay(
                            attendee.breathalyser_reading,
                          )}
                          {" · "}
                          {formatDateTime(attendee.signed_at)}
                        </Text>
                        {attendee.id.startsWith("local:") ? (
                          <Text style={styles.pendingUploadText}>
                            Pending upload · saved on this device
                          </Text>
                        ) : null}
                      </View>

                      <Pressable
                        style={styles.smallIconButton}
                        onPress={() => void removeAttendee(attendee)}
                        disabled={busy}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color="#BE123C"
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {pendingForActive.length > 0 ? (
              <View style={styles.pendingUploadCard}>
                <Ionicons
                  name="cloud-upload-outline"
                  size={18}
                  color="#92400E"
                />
                <Text style={styles.pendingUploadCardText}>
                  {pendingForActive.length} signature{
                    pendingForActive.length === 1 ? "" : "s"
                  } saved offline. TTTracker will upload them when a
                  connection is available.
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.completeButton,
                (busy ||
                  !online ||
                  pendingForActive.length > 0 ||
                  currentAttendees.length === 0 ||
                  needsResign.length > 0) &&
                  styles.disabledButton,
              ]}
              onPress={() => void completePrestart()}
              disabled={
                busy ||
                !online ||
                pendingForActive.length > 0 ||
                currentAttendees.length === 0 ||
                needsResign.length > 0
              }
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#FFFFFF"
                />
              )}
              <Text style={styles.completeButtonText}>
                Complete Prestart & Publish PDF
              </Text>
            </Pressable>
          </ScrollView>

          <Modal
            visible={revisionModalOpen}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setRevisionModalOpen(false)}
          >
            <SafeAreaView style={styles.modalSafe}>
              <KeyboardAvoidingView
                style={styles.flex}
                behavior={
                  Platform.OS === "ios" ? "padding" : undefined
                }
              >
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>
                      Revise Discussion Points
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      Changing these creates Revision{" "}
                      {active.current_revision + 1}.
                    </Text>
                  </View>

                  <Pressable
                    style={styles.iconButton}
                    onPress={() => setRevisionModalOpen(false)}
                    disabled={busy}
                  >
                    <Ionicons
                      name="close"
                      size={21}
                      color="#334155"
                    />
                  </Pressable>
                </View>

                <ScrollView
                  contentContainerStyle={styles.modalContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.fieldLabel}>
                    Discussion points
                  </Text>
                  <TextInput
                    value={revisionDraft}
                    onChangeText={setRevisionDraft}
                    style={styles.largeTextArea}
                    multiline
                    textAlignVertical="top"
                  />

                  <Text style={styles.fieldLabel}>
                    Revision note
                  </Text>
                  <TextInput
                    value={revisionNote}
                    onChangeText={setRevisionNote}
                    style={styles.input}
                    placeholder="What changed / why?"
                    placeholderTextColor="#94A3B8"
                  />

                  <View style={styles.warningCard}>
                    <Ionicons
                      name="information-circle-outline"
                      size={21}
                      color="#1D4ED8"
                    />
                    <Text style={styles.infoText}>
                      Existing signatures stay in the audit history,
                      but employees who signed an earlier revision must
                      sign again against the new discussion before this
                      prestart can be completed.
                    </Text>
                  </View>

                  <Pressable
                    style={[
                      styles.primaryButton,
                      busy && styles.disabledButton,
                    ]}
                    onPress={() => void saveRevision()}
                    disabled={busy}
                  >
                    <Text style={styles.primaryButtonText}>
                      Save Discussion Revision
                    </Text>
                  </Pressable>
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
            />
          }
        >
          <View>
            <Text style={styles.eyebrow}>FIELD OPERATIONS</Text>
            <Text style={styles.title}>Site Prestart</Text>
            <Text style={styles.subtitle}>
              Admin-led employee declaration and signed site prestart
              register.
            </Text>
          </View>

          <Section title="Start New Prestart">
            <Text style={styles.fieldLabel}>Project</Text>
            <Pressable
              style={styles.selector}
              onPress={() => setProjectPickerOpen(true)}
            >
              <View style={styles.flex}>
                <Text style={styles.selectorLabel}>
                  {projectLabel(selectedProject)}
                </Text>
                {selectedProject?.status ? (
                  <Text style={styles.selectorMeta}>
                    {selectedProject.status}
                  </Text>
                ) : null}
              </View>

              <Ionicons
                name="chevron-down"
                size={18}
                color="#64748B"
              />
            </Pressable>

            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput
              value={prestartDate}
              onChangeText={(value) => setPrestartDate(formatDateInput(value))}
              style={styles.input}
              placeholder="DD/MM/YYYY"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={10}
            />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              style={styles.input}
              placeholder="Site compound, tower area, workfront…"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.fieldLabel}>Discussion points</Text>
            <TextInput
              value={discussionPoints}
              onChangeText={setDiscussionPoints}
              style={styles.largeTextArea}
              placeholder={
                "Today's work, hazards, interfaces, weather, access, changes, controls and key discussion points…"
              }
              placeholderTextColor="#94A3B8"
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Site / admin notes</Text>
            <TextInput
              value={adminNotes}
              onChangeText={setAdminNotes}
              style={styles.textArea}
              placeholder="Optional notes / items to revisit…"
              placeholderTextColor="#94A3B8"
              multiline
              textAlignVertical="top"
            />

            <Pressable
              style={[
                styles.primaryButton,
                busy && styles.disabledButton,
              ]}
              onPress={() => void startPrestart()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons
                  name="people-outline"
                  size={19}
                  color="#FFFFFF"
                />
              )}
              <Text style={styles.primaryButtonText}>
                Start Employee Sign-On
              </Text>
            </Pressable>
          </Section>

          {drafts.length > 0 ? (
            <Section title="Draft Prestarts">
              <Text style={styles.helper}>
                Resume a prestart if the app was closed before the final
                PDF was published.
              </Text>

              <View style={styles.draftList}>
                {drafts.map((draft) => (
                  <Pressable
                    key={draft.id}
                    style={styles.draftRow}
                    onPress={() => void resumeDraft(draft.id)}
                    disabled={busy}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.employeeName}>
                        {draft.prestart_number} · {draft.location}
                      </Text>
                      <Text style={styles.employeeMeta}>
                        {prestartProjectLabel(draft) || "Project"} ·{" "}
                        {formatDate(draft.prestart_date)} · R
                        {draft.current_revision}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#94A3B8"
                    />
                  </Pressable>
                ))}
              </View>
            </Section>
          ) : null}

          <View style={styles.infoCard}>
            <Ionicons
              name="cloud-upload-outline"
              size={21}
              color="#1D4ED8"
            />
            <Text style={styles.infoText}>
              Completion saves the register in TTTracker, generates one
              PDF containing the discussion, notes, employee list and
              signatures, then publishes it to Project Delivery / 04 HSEQ
              / Prestarts in SharePoint.
            </Text>
          </View>
        </ScrollView>

        <Modal
          visible={projectPickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            setProjectSearch("");
            setProjectPickerOpen(false);
          }}
        >
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Project</Text>
                <Text style={styles.modalSubtitle}>
                  The final PDF uses this project&apos;s SharePoint link.
                </Text>
              </View>

              <Pressable
                style={styles.iconButton}
                onPress={() => {
                  setProjectSearch("");
                  setProjectPickerOpen(false);
                }}
              >
                <Ionicons
                  name="close"
                  size={21}
                  color="#334155"
                />
              </Pressable>
            </View>

            <View style={styles.modalContent}>
              <View style={styles.searchWrap}>
                <Ionicons
                  name="search-outline"
                  size={18}
                  color="#64748B"
                />
                <TextInput
                  value={projectSearch}
                  onChangeText={setProjectSearch}
                  style={styles.searchInput}
                  placeholder="Search project number or name…"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoFocus
                />
              </View>

              {filteredProjects.map((project) => {
                const sharePointReady = Boolean(
                  project.sharepoint_drive_id &&
                    project.sharepoint_folder_id,
                );

                return (
                  <Pressable
                    key={project.id}
                    style={[
                      styles.projectRow,
                      project.id === projectId &&
                        styles.projectRowSelected,
                    ]}
                    onPress={() => {
                      setProjectId(project.id);
                      setProjectSearch("");
                      setProjectPickerOpen(false);
                    }}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.employeeName}>
                        {projectLabel(project)}
                      </Text>
                      <Text
                        style={[
                          styles.employeeMeta,
                          !sharePointReady && styles.warningMeta,
                        ]}
                      >
                        {sharePointReady
                          ? "SharePoint linked"
                          : "SharePoint not linked — cannot finalise"}
                      </Text>
                    </View>

                    {project.id === projectId ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color="#2563EB"
                      />
                    ) : null}
                  </Pressable>
                );
              })}

              {filteredProjects.length === 0 ? (
                <Text style={styles.emptyText}>
                  No permitted projects match that search.
                </Text>
              ) : projects.length > filteredProjects.length ? (
                <Text style={styles.projectSearchHint}>
                  Search by project number or name to narrow the list.
                </Text>
              ) : null}
            </View>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SignaturePad({
  strokes,
  onChange,
  onInteractionChange,
  disabled,
}: {
  strokes: SignatureStroke[];
  onChange: (strokes: SignatureStroke[]) => void;
  onInteractionChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const strokesRef = useRef(strokes);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(
    () => () => {
      onInteractionChange?.(false);
    },
    [onInteractionChange],
  );

  const pointFromEvent = useCallback(
    (event: {
      nativeEvent: {
        locationX: number;
        locationY: number;
      };
    }) => {
      if (width <= 0) return null;

      const x = Math.max(
        0,
        Math.min(
          PAD_WIDTH,
          (event.nativeEvent.locationX / width) * PAD_WIDTH,
        ),
      );
      const y = Math.max(
        0,
        Math.min(PAD_HEIGHT, event.nativeEvent.locationY),
      );

      return { x, y };
    },
    [width],
  );

  const emit = useCallback(
    (next: SignatureStroke[]) => {
      strokesRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onStartShouldSetPanResponderCapture: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponderCapture: () => !disabled,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
          if (disabled) return;
          onInteractionChange?.(true);
          const point = pointFromEvent(event);
          if (!point) return;

          emit([...strokesRef.current, [point]]);
        },
        onPanResponderMove: (event) => {
          if (disabled) return;
          const point = pointFromEvent(event);
          if (!point) return;

          const current = strokesRef.current;

          if (current.length === 0) {
            emit([[point]]);
            return;
          }

          const next = current.map((stroke, index) =>
            index === current.length - 1
              ? [...stroke, point]
              : stroke,
          );

          emit(next);
        },
        onPanResponderRelease: () => {
          onInteractionChange?.(false);
        },
        onPanResponderTerminate: () => {
          onInteractionChange?.(false);
        },
      }),
    [disabled, emit, onInteractionChange, pointFromEvent],
  );

  return (
    <View
      style={styles.signaturePad}
      onLayout={(event) =>
        setWidth(event.nativeEvent.layout.width)
      }
      onTouchStart={() => {
        if (!disabled) onInteractionChange?.(true);
      }}
      onTouchEnd={() => onInteractionChange?.(false)}
      onTouchCancel={() => onInteractionChange?.(false)}
      {...responder.panHandlers}
    >
      {width > 0
        ? strokes.flatMap((stroke, strokeIndex) =>
            stroke.slice(1).map((point, pointIndex) => {
              const previous = stroke[pointIndex];

              const x1 = (previous.x / PAD_WIDTH) * width;
              const y1 = previous.y;
              const x2 = (point.x / PAD_WIDTH) * width;
              const y2 = point.y;

              const dx = x2 - x1;
              const dy = y2 - y1;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx);
              const left = (x1 + x2) / 2 - length / 2;
              const top = (y1 + y2) / 2 - 1;

              return (
                <View
                  key={`${strokeIndex}-${pointIndex}`}
                  pointerEvents="none"
                  style={[
                    styles.signatureLine,
                    {
                      left,
                      top,
                      width: length,
                      transform: [{ rotateZ: `${angle}rad` }],
                    },
                  ]}
                />
              );
            }),
          )
        : null}

      {strokes.length === 0 ? (
        <Text pointerEvents="none" style={styles.signaturePlaceholder}>
          Sign here
        </Text>
      ) : null}
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SummaryChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryChip}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
  eyebrow: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  smallIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  summaryChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  summaryLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  summaryValue: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  section: {
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  sectionBody: {
    padding: 16,
    gap: 12,
  },
  bodyText: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 21,
  },
  helper: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
  fieldLabel: {
    marginTop: 2,
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    color: "#0F172A",
    fontSize: 14,
  },
  textArea: {
    minHeight: 94,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    padding: 13,
    color: "#0F172A",
    fontSize: 14,
  },
  largeTextArea: {
    minHeight: 150,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    padding: 13,
    color: "#0F172A",
    fontSize: 14,
  },
  selector: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectorLabel: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  selectorMeta: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#1D4ED8",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },
  outlineButton: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  outlineButtonText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.45,
  },
  searchWrap: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    color: "#0F172A",
    fontSize: 14,
  },
  searchResults: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  employeeRow: {
    minHeight: 58,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  employeeRowSigned: {
    backgroundColor: "#F0FDF4",
  },
  employeeName: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  employeeMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  pendingUploadText: {
    marginTop: 4,
    color: "#92400E",
    fontSize: 10,
    fontWeight: "800",
  },
  pendingUploadCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 12,
  },
  pendingUploadCardText: {
    flex: 1,
    color: "#92400E",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
  },
  signedBadge: {
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  signedBadgeText: {
    color: "#15803D",
    fontSize: 10,
    fontWeight: "900",
  },
  selectedEmployeeCard: {
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectedEmployeeName: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },
  selectedEmployeeMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 12,
  },
  declarationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  declarationCardAccepted: {
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },
  declarationText: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    lineHeight: 19,
  },
  signaturePad: {
    height: PAD_HEIGHT,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#94A3B8",
    backgroundColor: "#FFFFFF",
    position: "relative",
  },
  signatureLine: {
    position: "absolute",
    height: 2,
    backgroundColor: "#0F172A",
    borderRadius: 1,
  },
  signaturePlaceholder: {
    position: "absolute",
    alignSelf: "center",
    top: 58,
    color: "#CBD5E1",
    fontSize: 18,
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  attendeeList: {
    gap: 8,
  },
  attendeeRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  warningTitle: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "900",
  },
  warningText: {
    marginTop: 3,
    color: "#92400E",
    fontSize: 12,
    lineHeight: 18,
  },
  warningMeta: {
    color: "#B45309",
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: "#1E40AF",
    fontSize: 12,
    lineHeight: 18,
  },
  completeButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: "#047857",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  completeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  draftList: {
    gap: 8,
  },
  draftRow: {
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalTitle: {
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "900",
  },
  modalSubtitle: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 12,
  },
  modalContent: {
    padding: 16,
    gap: 12,
  },
  projectRow: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  projectRowSelected: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
  },
  projectSearchHint: {
    color: "#64748B",
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 4,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 8,
  },
  accessCard: {
    margin: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
    padding: 22,
    alignItems: "center",
  },
  accessTitle: {
    marginTop: 12,
    color: "#92400E",
    fontSize: 18,
    fontWeight: "900",
  },
  accessText: {
    marginTop: 8,
    color: "#92400E",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
});
