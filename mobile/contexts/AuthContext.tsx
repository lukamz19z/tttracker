import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { supabase } from "@/lib/supabase";

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
  loading: boolean;
  profile: MobileProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setCurrentProject: (projectId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type EmployeeRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  crew_id: string | null;
  current_project_id: string | null;
  crews:
    | { id: string; crew_number: string | null; crew_name: string | null }
    | Array<{ id: string; crew_number: string | null; crew_name: string | null }>
    | null;
};

type ProjectAccessRow = {
  project_id: string;
  projects:
    | { id: string; name: string; project_number: string | null; status: string | null }
    | Array<{ id: string; name: string; project_number: string | null; status: string | null }>
    | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fallbackName(session: Session): string {
  const metadataName = session.user.user_metadata?.full_name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  return session.user.email?.split("@")[0] ?? "User";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const clearProfile = useCallback(() => {
    setProfile(null);
    setProfileError(null);
    setProfileLoading(false);
  }, []);

  const loadProfile = useCallback(async (currentSession: Session) => {
    setProfileLoading(true);
    setProfileError(null);

    try {
      const userId = currentSession.user.id;
      const email = currentSession.user.email ?? "";

      const [employeeResult, projectAccessResult] = await Promise.all([
        supabase
          .from("employees")
          .select("id,full_name,role,crew_id,current_project_id,crews(id,crew_number,crew_name)")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("project_access")
          .select("project_id,projects(id,name,project_number,status)")
          .eq("user_id", userId),
      ]);

      if (employeeResult.error) throw employeeResult.error;
      if (projectAccessResult.error) throw projectAccessResult.error;

      const employee = (employeeResult.data ?? null) as EmployeeRow | null;
      const crew = one(employee?.crews);
      const accessRows = (projectAccessResult.data ?? []) as ProjectAccessRow[];

      const availableProjects = accessRows
        .map((access): AvailableProject | null => {
          const project = one(access.projects);
          if (!project) return null;
          return {
            id: project.id,
            name: project.name,
            projectNumber: project.project_number,
            status: project.status,
          };
        })
        .filter((project): project is AvailableProject => project !== null);

      const savedProjectId = employee?.current_project_id ?? null;
      const selectedProject =
        availableProjects.find((project) => project.id === savedProjectId) ??
        availableProjects.find((project) => project.status?.trim().toLowerCase() === "active") ??
        availableProjects[0] ??
        null;

      setProfile({
        userId,
        email,
        employeeId: employee?.id ?? null,
        fullName: employee?.full_name?.trim() || fallbackName(currentSession),
        employeeRole: employee?.role ?? null,
        crewId: crew?.id ?? employee?.crew_id ?? null,
        crewNumber: crew?.crew_number ?? null,
        crewName: crew?.crew_name ?? null,
        projectId: selectedProject?.id ?? null,
        projectName: selectedProject?.name ?? null,
        projectNumber: selectedProject?.projectNumber ?? null,
        projectStatus: selectedProject?.status ?? null,
        availableProjects,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load your TTTracker profile.";
      console.error("Unable to load profile:", error);
      setProfile(null);
      setProfileError(message);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) {
      clearProfile();
      return;
    }
    await loadProfile(session);
  }, [clearProfile, loadProfile, session]);

  const setCurrentProject = useCallback(
    async (projectId: string) => {
      if (!session) throw new Error("You are not signed in.");
      if (!profile) throw new Error("Your profile has not loaded.");

      const selectedProject = profile.availableProjects.find((project) => project.id === projectId);
      if (!selectedProject) throw new Error("You do not have access to that project.");

      const previous = profile;
      setProfile((current) =>
        current
          ? {
              ...current,
              projectId: selectedProject.id,
              projectName: selectedProject.name,
              projectNumber: selectedProject.projectNumber,
              projectStatus: selectedProject.status,
            }
          : current,
      );

      try {
        const { error } = await supabase.rpc("set_my_current_project", {
          selected_project_id: projectId,
        });
        if (error) throw error;
        await loadProfile(session);
      } catch (error) {
        setProfile(previous);
        throw error;
      }
    },
    [loadProfile, profile, session],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active) return;
        setSession(data.session);
        if (data.session) await loadProfile(data.session);
        else clearProfile();
      } catch (error) {
        console.error("Unable to initialise authentication:", error);
        if (active) {
          setSession(null);
          clearProfile();
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
      setTimeout(() => {
        if (!active) return;
        if (nextSession) void loadProfile(nextSession);
        else clearProfile();
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [clearProfile, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) throw new Error("Enter your email address and password.");
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    clearProfile();
  }, [clearProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      profile,
      profileLoading,
      profileError,
      signIn,
      signOut,
      refreshProfile,
      setCurrentProject,
    }),
    [session, loading, profile, profileLoading, profileError, signIn, signOut, refreshProfile, setCurrentProject],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
