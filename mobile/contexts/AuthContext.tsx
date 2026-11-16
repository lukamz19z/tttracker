import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { ApiRequestError, apiJson } from "@/lib/api/client";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { supabase } from "@/lib/supabase";
import { clearMobileBootstrapCache, getMobileBootstrap } from "@/lib/api/mobile-bootstrap";
import { setApiSession } from "@/lib/api/client";
import { isCurrentProjectGeneration, resolveInitialProjectId } from "@/lib/project-context";
import { isTransientBackendFailure } from "../../lib/backend-resilience";

export type AvailableProject = {
  id: string;
  name: string;
  projectNumber: string | null;
  status: string | null;
};

export type MobileProfile = {
  userId: string;
  email: string;
  employeeId: string | null;
  fullName: string;
  employeeRole: string | null;
  crewId: string | null;
  crewNumber: string | null;
  crewName: string | null;
  projectId: string | null;
  projectName: string | null;
  projectNumber: string | null;
  projectStatus: string | null;
  availableProjects: AvailableProject[];
};

type AuthContextValue = {
  session: Session | null;
  status: "initialising" | "signed_in" | "signed_out";
  loading: boolean;
  profile: MobileProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  currentProjectId: string | null;
  projectPersistencePending: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setCurrentProject: (projectId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type CachedProfile = {
  savedAt: string;
  profile: MobileProfile;
};

const PROFILE_CACHE_PREFIX = "tttracker:mobile-profile:v2:";
const SELECTED_PROJECT_PREFIX = "tttracker:mobile-selected-project:v1:";
const PERSISTED_PROJECT_PREFIX = "tttracker:mobile-server-project:v1:";

function selectedProjectKey(userId: string) {
  return `${SELECTED_PROJECT_PREFIX}${userId}`;
}

function persistedProjectKey(userId: string) {
  return `${PERSISTED_PROJECT_PREFIX}${userId}`;
}

function traceProject(stage: string, details: Record<string, unknown>) {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.debug(`[project-context] ${stage}`, details);
}

function profileCacheKey(userId: string) {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

function fallbackName(session: Session): string {
  const metadataName = session.user.user_metadata?.full_name;

  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  return session.user.email?.split("@")[0] ?? "User";
}

async function readCachedProfile(userId: string) {
  try {
    const raw = await AsyncStorage.getItem(profileCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedProfile;
    if (!parsed?.profile || parsed.profile.userId !== userId) return null;
    return parsed;
  } catch (error) {
    console.warn("TTTracker profile cache could not be read:", error);
    return null;
  }
}

async function writeCachedProfile(profile: MobileProfile) {
  try {
    await AsyncStorage.setItem(
      profileCacheKey(profile.userId),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        profile,
      } satisfies CachedProfile),
    );
  } catch (error) {
    console.warn("TTTracker profile cache could not be saved:", error);
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const mountedRef = useRef(true);
  const authGenerationRef = useRef(0);
  const activeSessionRef = useRef<Session | null>(null);
  const profileRef = useRef<MobileProfile | null>(null);
  const selectedProjectIdRef = useRef<string | null>(null);
  const selectionGenerationRef = useRef(0);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastPersistenceTargetRef = useRef<string | null>(null);
  const profileRequestRef = useRef<{
    userId: string;
    promise: Promise<void>;
  } | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("initialising");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [projectPersistencePending, setProjectPersistencePending] = useState(false);
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);

  const applyProfile = useCallback((next: MobileProfile | null) => {
    profileRef.current = next;
    selectedProjectIdRef.current = next?.projectId ?? null;

    if (!mountedRef.current) return;

    setProfile(next);
    setCurrentProjectIdState(next?.projectId ?? null);

    if (next) {
      void writeCachedProfile(next);
    }
  }, []);

  const clearProfile = useCallback(() => {
    profileRef.current = null;
    selectedProjectIdRef.current = null;
    setCurrentProjectIdState(null);
    selectionGenerationRef.current++;
    lastPersistenceTargetRef.current = null;

    if (!mountedRef.current) return;

    setProfile(null);
    setProfileError(null);
    setProfileLoading(false);
    setProjectPersistencePending(false);
  }, []);

  const fetchAndApplyProfile = useCallback(
    async (currentSession: Session, force = false) => {
      const userId = currentSession.user.id;

      if (profileRequestRef.current?.userId === userId) {
        return profileRequestRef.current.promise;
      }

      const requestSelectionGeneration = selectionGenerationRef.current;
      const task = (async () => {
        const alreadyHaveProfile = profileRef.current?.userId === userId;

        if (mountedRef.current && !alreadyHaveProfile) {
          setProfileLoading(true);
        }

        if (mountedRef.current) {
          setProfileError(null);
        }

        try {
          const bootstrap = await getMobileBootstrap(userId, force);
          const employee = bootstrap.employee;
          const availableProjects: AvailableProject[] = (bootstrap.projects ?? []).map((project) => ({
            id: project.id,
            name: project.name,
            projectNumber: project.projectNumber,
            status: project.status,
          }));
          const savedProjectId = employee?.currentProjectId ?? null;
          const resolvedProjectId = resolveInitialProjectId(
            availableProjects,
            selectedProjectIdRef.current,
            savedProjectId,
          );
          const selectedProject = availableProjects.find((project) => project.id === resolvedProjectId) ?? null;
          traceProject("boot", {
            projectId: selectedProject?.id ?? null,
            projectNumber: selectedProject?.projectNumber ?? null,
            generation: selectionGenerationRef.current,
            source: selectedProject?.id === selectedProjectIdRef.current ? "local/runtime" : selectedProject?.id === savedProjectId ? "server" : "authorized fallback",
          });

          if (!mountedRef.current || activeSessionRef.current?.user.id !== userId) return;

          /* A profile request that began before a user switch cannot undo it. */
          if (!isCurrentProjectGeneration(requestSelectionGeneration, selectionGenerationRef.current)) {
            const currentSelection = availableProjects.find(
              (project) => project.id === selectedProjectIdRef.current,
            );
            if (currentSelection) {
              traceProject("stale profile selection ignored", {
                projectId: currentSelection.id,
                generation: selectionGenerationRef.current,
              });
              applyProfile({
                userId,
                email: currentSession.user.email ?? "",
                employeeId: employee?.id ?? null,
                fullName: employee?.fullName?.trim() || fallbackName(currentSession),
                employeeRole: employee?.position ?? null,
                crewId: employee?.crewId ?? null,
                crewNumber: employee?.crewNumber ?? null,
                crewName: employee?.crewName ?? null,
                projectId: currentSelection.id,
                projectName: currentSelection.name,
                projectNumber: currentSelection.projectNumber,
                projectStatus: currentSelection.status,
                availableProjects,
              });
              return;
            }
          }

          if (savedProjectId && savedProjectId === selectedProject?.id) {
            void AsyncStorage.setItem(persistedProjectKey(userId), savedProjectId).catch(() => undefined);
          } else if (!savedProjectId) {
            void AsyncStorage.removeItem(persistedProjectKey(userId)).catch(() => undefined);
          }

          selectedProjectIdRef.current = selectedProject?.id ?? null;
          if (
            selectedProject &&
            savedProjectId !== selectedProject.id &&
            selectionGenerationRef.current === requestSelectionGeneration
          ) {
            setProjectPersistencePending(true);
          }

          applyProfile({
            userId,
            email: currentSession.user.email ?? "",
            employeeId: employee?.id ?? null,
            fullName: employee?.fullName?.trim() || fallbackName(currentSession),
            employeeRole: employee?.position ?? null,
            crewId: employee?.crewId ?? null,
            crewNumber: employee?.crewNumber ?? null,
            crewName: employee?.crewName ?? null,
            projectId: selectedProject?.id ?? null,
            projectName: selectedProject?.name ?? null,
            projectNumber: selectedProject?.projectNumber ?? null,
            projectStatus: selectedProject?.status ?? null,
            availableProjects,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load your TTTracker profile.";

          console.error("Unable to load profile:", error);

          if (mountedRef.current && activeSessionRef.current?.user.id === userId) {
            /* Keep a valid cached profile visible if the live refresh fails. */
            setProfileError(message);
          }
        } finally {
          if (mountedRef.current && activeSessionRef.current?.user.id === userId) {
            setProfileLoading(false);
          }
        }
      })();

      const tracked = task.finally(() => {
        if (profileRequestRef.current?.promise === tracked) {
          profileRequestRef.current = null;
        }
      });

      profileRequestRef.current = { userId, promise: tracked };
      return tracked;
    },
    [applyProfile],
  );

  const hydrateThenRefresh = useCallback(
    async (currentSession: Session) => {
      const userId = currentSession.user.id;
      if (profileRef.current?.userId && profileRef.current.userId !== userId) {
        selectedProjectIdRef.current = null;
        selectionGenerationRef.current = 0;
        lastPersistenceTargetRef.current = null;
        setProjectPersistencePending(false);
      }
      const cached = await readCachedProfile(userId);
      let locallySelectedId: string | null = null;
      let lastPersistedId: string | null = null;
      try {
        locallySelectedId = await AsyncStorage.getItem(selectedProjectKey(userId));
        lastPersistedId = await AsyncStorage.getItem(persistedProjectKey(userId));
      } catch (error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("[project-context] local selection could not be read", error instanceof Error ? error.message : "unknown");
      }

      if (!mountedRef.current || activeSessionRef.current?.user.id !== userId) return;

      if (cached?.profile) {
        const cachedProjects = cached.profile.availableProjects ?? [];
        const localChoice = cachedProjects.find((project) => project.id === locallySelectedId);
        const cachedChoice = cachedProjects.find((project) => project.id === cached.profile.projectId);
        const choice = localChoice ?? cachedChoice;
        selectedProjectIdRef.current = choice?.id ?? null;
        if (localChoice && lastPersistedId && localChoice.id !== lastPersistedId) {
          setProjectPersistencePending(true);
        }
        if (choice) {
          applyProfile({ ...cached.profile, projectId: choice.id, projectName: choice.name, projectNumber: choice.projectNumber, projectStatus: choice.status });
        } else {
          applyProfile(cached.profile);
        }
        setProfileLoading(false);
      } else {
        setProfileLoading(true);
        selectedProjectIdRef.current = locallySelectedId;
      }

      /* Revalidate quietly. Cached data stays on screen while this runs. */
      void fetchAndApplyProfile(currentSession);
    },
    [applyProfile, fetchAndApplyProfile],
  );

  const refreshProfile = useCallback(async () => {
    if (!session) {
      clearProfile();
      return;
    }

    clearMobileBootstrapCache(session.user.id);
    lastPersistenceTargetRef.current = null;
    await fetchAndApplyProfile(session, true);
  }, [clearProfile, fetchAndApplyProfile, session]);

  const setCurrentProject = useCallback(
    async (projectId: string) => {
      if (!session) throw new Error("You are not signed in.");

      const currentProfile = profileRef.current;
      if (!currentProfile) {
        throw new Error("Your profile has not loaded.");
      }

      const selectedProject = currentProfile.availableProjects.find(
        (project) => project.id === projectId,
      );

      if (!selectedProject) {
        throw new Error("You do not have access to that project.");
      }

      const previous = currentProfile;
      const generation = ++selectionGenerationRef.current;
      const startedAt = Date.now();
      selectedProjectIdRef.current = selectedProject.id;
      lastPersistenceTargetRef.current = selectedProject.id;
      const next: MobileProfile = {
        ...currentProfile,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        projectNumber: selectedProject.projectNumber,
        projectStatus: selectedProject.status,
      };

      traceProject("select requested", { projectId, projectNumber: selectedProject.projectNumber, generation });
      applyProfile(next);
      setProjectPersistencePending(true);
      void AsyncStorage.setItem(selectedProjectKey(session.user.id), selectedProject.id).catch(() => undefined);
      traceProject("local committed", { projectId, projectNumber: selectedProject.projectNumber, generation });

      const persist = async () => {
        try {
          const result = await apiJson<{
            persisted: boolean;
            project: { id: string; name: string; projectNumber: string | null; status: string | null };
          }>("/api/mobile/project-selection", {
            method: "POST",
            body: JSON.stringify({ projectId: selectedProject.id }),
            dedupe: false,
          });
          if (!isCurrentProjectGeneration(generation, selectionGenerationRef.current)) {
            traceProject("stale switch response ignored", { projectId, generation, currentGeneration: selectionGenerationRef.current, durationMs: Date.now() - startedAt });
            return;
          }
          if (!result.persisted || result.project.id !== selectedProject.id) throw new Error("The server did not confirm the selected project.");
          clearMobileBootstrapCache(session.user.id);
          selectedProjectIdRef.current = result.project.id;
          applyProfile({ ...next, projectId: result.project.id, projectName: result.project.name, projectNumber: result.project.projectNumber, projectStatus: result.project.status });
          setProjectPersistencePending(false);
          lastPersistenceTargetRef.current = null;
          void AsyncStorage.setItem(persistedProjectKey(session.user.id), result.project.id).catch(() => undefined);
          void writeCachedProfile({ ...next, projectId: result.project.id, projectName: result.project.name, projectNumber: result.project.projectNumber, projectStatus: result.project.status });
          traceProject("server persisted", { projectId: result.project.id, projectNumber: result.project.projectNumber, generation, durationMs: Date.now() - startedAt });
        } catch (error) {
          if (!isCurrentProjectGeneration(generation, selectionGenerationRef.current)) return;
          const definiteRejection = error instanceof ApiRequestError && [400, 403, 404, 409].includes(error.status);
          if (definiteRejection) {
            const previousProject = previous.availableProjects.find((project) => project.id === previous.projectId);
            selectedProjectIdRef.current = previousProject?.id ?? null;
            lastPersistenceTargetRef.current = null;
            applyProfile(previous);
            if (previousProject) {
              void AsyncStorage.setItem(selectedProjectKey(session.user.id), previousProject.id).catch(() => undefined);
            } else {
              void AsyncStorage.removeItem(selectedProjectKey(session.user.id)).catch(() => undefined);
            }
            setProjectPersistencePending(false);
            throw error;
          }
          /* Timeout/network errors are ambiguous; keep local selection and retry on next boot. */
          setProjectPersistencePending(true);
          if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("[project-context] persistence pending after ambiguous failure", { projectId, generation, durationMs: Date.now() - startedAt });
        }
      };

      const queued = persistenceQueueRef.current.catch(() => undefined).then(persist);
      persistenceQueueRef.current = queued.then(() => undefined, () => undefined);
      await queued;
    },
    [applyProfile, session],
  );

  useEffect(() => {
    const projectId = profile?.projectId;
    if (!session || !projectId || !projectPersistencePending || lastPersistenceTargetRef.current === projectId) return;
    void setCurrentProject(projectId).catch((error) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("[project-context] pending project persistence retry failed", {
        projectId,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  }, [profile?.projectId, projectPersistencePending, session, setCurrentProject]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !session || !projectPersistencePending) return;
      const projectId = profileRef.current?.projectId;
      if (!projectId) return;
      lastPersistenceTargetRef.current = null;
      void setCurrentProject(projectId).catch((error) => {
        if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("[project-context] foreground persistence retry failed", { projectId, error: error instanceof Error ? error.message : "unknown" });
      });
    });
    return () => subscription.remove();
  }, [projectPersistencePending, session, setCurrentProject]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const initialGeneration = authGenerationRef.current;

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active || initialGeneration !== authGenerationRef.current) return;

        /* A locally restored session is authoritative for signed-in UI. */
        if (error && !data.session) throw error;
        if (error) console.warn("TTTracker local session restored; background verification reported an error.", error.message);

        authGenerationRef.current++;
        activeSessionRef.current = data.session;
        setApiSession(data.session);
        setSession(data.session);
        setStatus(data.session ? "signed_in" : "signed_out");
        setLoading(false);

        if (data.session) {
          await hydrateThenRefresh(data.session);
        } else {
          clearProfile();
        }
      } catch (error) {
        if (active && initialGeneration === authGenerationRef.current) {
          if (isTransientBackendFailure(error)) {
            console.warn("TTTracker session check temporarily unavailable; keeping the current local auth state.");
            setProfileError("Unable to verify your saved session right now. Check your connection and retry.");
            setProfileLoading(false);
            if (activeSessionRef.current) {
              setSession(activeSessionRef.current);
              setStatus("signed_in");
              setLoading(false);
            } else {
              /* Wait for Supabase INITIAL_SESSION; never treat delayed storage as sign-out. */
              setStatus("initialising");
              setLoading(true);
            }
          } else {
            console.error("Unable to initialise authentication:", error);
            authGenerationRef.current++;
            activeSessionRef.current = null;
            setSession(null);
            setStatus("signed_out");
            clearProfile();
            setLoading(false);
          }
        }
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) return;

        authGenerationRef.current++;
        activeSessionRef.current = nextSession;
        setApiSession(nextSession);
        setSession(nextSession);
        setStatus(nextSession ? "signed_in" : "signed_out");
        setLoading(false);

        /*
         * INITIAL_SESSION can win the race against iOS SecureStore/AsyncStorage
         * hydration. Accept it as the canonical local session and hydrate once.
         */
        if (event === "INITIAL_SESSION") {
          if (nextSession) void hydrateThenRefresh(nextSession);
          else clearProfile();
          return;
        }

        if (event === "TOKEN_REFRESHED") {
          /* A new JWT does not require re-downloading the employee profile. */
          return;
        }

        if (!nextSession) {
          const previousUserId = profileRef.current?.userId;
          clearMobileBootstrapCache();
          clearProfile();

          if (previousUserId) {
            void AsyncStorage.removeItem(profileCacheKey(previousUserId));
          }
          return;
        }

        if (
          profileRef.current?.userId !== nextSession.user.id ||
          event === "USER_UPDATED"
        ) {
          void hydrateThenRefresh(nextSession);
        }
      },
    );

    return () => {
      active = false;
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, [clearProfile, hydrateThenRefresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      throw new Error("Enter your email address and password.");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const userId = session?.user.id ?? profileRef.current?.userId ?? null;

    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    if (userId) {
      await AsyncStorage.removeItem(profileCacheKey(userId));
      await AsyncStorage.removeItem(selectedProjectKey(userId));
      await AsyncStorage.removeItem(persistedProjectKey(userId));
    }

    authGenerationRef.current++;
    activeSessionRef.current = null;
    setSession(null);
    setStatus("signed_out");
    setLoading(false);
    clearProfile();
  }, [clearProfile, session?.user.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      status,
      loading,
      profile,
      profileLoading,
      profileError,
      currentProjectId,
      projectPersistencePending,
      signIn,
      signOut,
      refreshProfile,
      setCurrentProject,
    }),
    [
      session,
      status,
      loading,
      profile,
      profileLoading,
      profileError,
      currentProjectId,
      projectPersistencePending,
      signIn,
      signOut,
      refreshProfile,
      setCurrentProject,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
