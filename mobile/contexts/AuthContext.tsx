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

export type MobileRole =
  | "crew"
  | "leading_hand"
  | "mechanic"
  | "admin";

export type MobileProfile = {
  userId: string;
  email: string;
  employeeId: string | null;
  fullName: string;
  employeeRole: string | null;
  mobileRole: MobileRole;
  crewId: string | null;
  crewNumber: string | null;
  crewName: string | null;
  projectId: string | null;
  projectName: string | null;
  projectNumber: string | null;
  projectStatus: string | null;
  availableProjects: Array<{
    id: string;
    name: string;
    projectNumber: string | null;
    status: string | null;
  }>;
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
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isMobileRole(value: unknown): value is MobileRole {
  return (
    value === "crew" ||
    value === "leading_hand" ||
    value === "mechanic" ||
    value === "admin"
  );
}

function fallbackName(session: Session): string {
  const metadataName = session.user.user_metadata?.full_name;

  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

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

      const [
        mobileRoleResult,
        employeeResult,
        projectAccessResult,
      ] = await Promise.all([
        supabase
          .from("user_mobile_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle(),

        supabase
          .from("employees")
          .select(`
            id,
            full_name,
            role,
            crew_id,
            crews (
              id,
              crew_number,
              crew_name
            )
          `)
          .eq("user_id", userId)
          .maybeSingle(),

        supabase
          .from("project_access")
          .select(`
            project_id,
            projects (
              id,
              name,
              project_number,
              status
            )
          `)
          .eq("user_id", userId),
      ]);

      if (mobileRoleResult.error) {
        throw mobileRoleResult.error;
      }

      if (employeeResult.error) {
        throw employeeResult.error;
      }

      if (projectAccessResult.error) {
        throw projectAccessResult.error;
      }

      const rawRole = mobileRoleResult.data?.role;
      const mobileRole: MobileRole = isMobileRole(rawRole)
        ? rawRole
        : "crew";

      const employee = employeeResult.data;

      const crewRelation = employee?.crews;
      const crew = Array.isArray(crewRelation)
        ? crewRelation[0] ?? null
        : crewRelation ?? null;

      const availableProjects =
        projectAccessResult.data
          ?.map((access) => {
            const projectRelation = access.projects;
            const project = Array.isArray(projectRelation)
              ? projectRelation[0] ?? null
              : projectRelation ?? null;

            if (!project) {
              return null;
            }

            return {
              id: project.id,
              name: project.name,
              projectNumber: project.project_number,
              status: project.status,
            };
          })
          .filter(
            (
              project,
            ): project is {
              id: string;
              name: string;
              projectNumber: string | null;
              status: string | null;
            } => project !== null,
          ) ?? [];

      const selectedProject =
        availableProjects.find(
          (project) =>
            project.status?.toLowerCase() === "active",
        ) ??
        availableProjects[0] ??
        null;

      setProfile({
        userId,
        email,
        employeeId: employee?.id ?? null,
        fullName:
          employee?.full_name?.trim() ||
          fallbackName(currentSession),
        employeeRole: employee?.role ?? null,
        mobileRole,
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
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load your TTTracker profile.";

      console.error("Unable to load profile:", message);

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

  useEffect(() => {
    let active = true;

    async function initialise() {
      try {
        const {
          data: { session: existingSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!active) {
          return;
        }

        setSession(existingSession);

        if (existingSession) {
          await loadProfile(existingSession);
        } else {
          clearProfile();
        }
      } catch (error) {
        console.error(
          "Unable to initialise authentication:",
          error,
        );

        if (active) {
          setSession(null);
          clearProfile();
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void initialise();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession);
      setLoading(false);

      setTimeout(() => {
        if (!active) {
          return;
        }

        if (nextSession) {
          void loadProfile(nextSession);
        } else {
          clearProfile();
        }
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [clearProfile, loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const cleanEmail = email.trim().toLowerCase();

      if (!cleanEmail || !password) {
        throw new Error(
          "Enter your email address and password.",
        );
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        throw error;
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

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
    }),
    [
      session,
      loading,
      profile,
      profileLoading,
      profileError,
      signIn,
      signOut,
      refreshProfile,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider",
    );
  }

  return context;
}