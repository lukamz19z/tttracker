"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FolderKanban,
  HardHat,
  Loader2,
  Save,
  ShieldCheck,
  Shirt,
  UserCheck,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
  user_id: string | null;
  notes: string | null;
  shirt_size: string | null;
  jacket_size: string | null;
  glove_size: string | null;
  pants_size: string | null;
  created_at?: string | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
  project_number?: string | null;
  status?: string | null;
};

type ProjectAccessRow = {
  project_id: string;
};

type ProfileForm = {
  fullName: string;
  role: string;
  crewId: string;
  active: boolean;
  notes: string;
  shirtSize: string;
  jacketSize: string;
  gloveSize: string;
  pantsSize: string;
};

type TabKey = "overview" | "training" | "ppe" | "projects" | "history";

const SHIRT_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
];

const JACKET_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
];

const GLOVE_SIZES = ["S", "M", "L", "XL", "2XL"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function crewLabel(crew: Crew | null | undefined) {
  if (!crew) return "Unassigned";

  const number = clean(crew.crew_number);
  const name = clean(crew.crew_name);

  if (number && name) return `Crew ${number} · ${name}`;
  if (number) return `Crew ${number}`;
  if (name) return name;

  return "Unassigned";
}

function hasCompletePpe(employee: Employee | null) {
  if (!employee) return false;

  return Boolean(
    clean(employee.shirt_size) &&
      clean(employee.jacket_size) &&
      clean(employee.glove_size) &&
      clean(employee.pants_size),
  );
}

export default function EmployeeProfilePage() {
  const params = useParams<{ employeeId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const employeeId = params.employeeId;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<ProfileForm>({
    fullName: "",
    role: "",
    crewId: "",
    active: true,
    notes: "",
    shirtSize: "",
    jacketSize: "",
    gloveSize: "",
    pantsSize: "",
  });

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const selectedCrew = useMemo(
    () => crews.find((crew) => crew.id === employee?.crew_id) ?? null,
    [crews, employee?.crew_id],
  );

  const assignedProjects = useMemo(
    () => projects.filter((project) => projectIds.includes(project.id)),
    [projectIds, projects],
  );

  const loadData = useCallback(async () => {
    const employeeResult = await supabase
      .from("employees")
      .select(
        "id, full_name, role, crew_id, active, user_id, notes, shirt_size, jacket_size, glove_size, pants_size, created_at",
      )
      .eq("id", employeeId)
      .single();

    if (employeeResult.error || !employeeResult.data) {
      throw new Error(
        employeeResult.error?.message || "Employee profile not found.",
      );
    }

    const loadedEmployee = employeeResult.data as Employee;

    const [crewResult, projectResult] = await Promise.all([
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, leading_hand, active")
        .order("crew_number", { ascending: true }),
      supabase
        .from("projects")
        .select("id, name, project_number, status")
        .order("name", { ascending: true }),
    ]);

    if (crewResult.error) {
      throw new Error(crewResult.error.message);
    }

    if (projectResult.error) {
      throw new Error(projectResult.error.message);
    }

    let loadedProjectIds: string[] = [];

    if (loadedEmployee.user_id) {
      const accessResult = await supabase
        .from("project_access")
        .select("project_id")
        .eq("user_id", loadedEmployee.user_id);

      if (!accessResult.error) {
        loadedProjectIds = (
          (accessResult.data ?? []) as ProjectAccessRow[]
        ).map((row) => row.project_id);
      }
    }

    setEmployee(loadedEmployee);
    setCrews((crewResult.data ?? []) as Crew[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setProjectIds(loadedProjectIds);

    setForm({
      fullName: clean(loadedEmployee.full_name),
      role: clean(loadedEmployee.role),
      crewId: clean(loadedEmployee.crew_id),
      active: loadedEmployee.active !== false,
      notes: clean(loadedEmployee.notes),
      shirtSize: clean(loadedEmployee.shirt_size),
      jacketSize: clean(loadedEmployee.jacket_size),
      gloveSize: clean(loadedEmployee.glove_size),
      pantsSize: clean(loadedEmployee.pants_size),
    });
  }, [employeeId, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadData();
        } catch (error) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Unable to load the employee profile.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  function cancelEdit() {
    if (!employee) return;

    setForm({
      fullName: clean(employee.full_name),
      role: clean(employee.role),
      crewId: clean(employee.crew_id),
      active: employee.active !== false,
      notes: clean(employee.notes),
      shirtSize: clean(employee.shirt_size),
      jacketSize: clean(employee.jacket_size),
      gloveSize: clean(employee.glove_size),
      pantsSize: clean(employee.pants_size),
    });
    setEditing(false);
  }

  async function saveProfile() {
    if (!employee) return;

    const fullName = form.fullName.trim();

    if (!fullName) {
      setMessage({
        tone: "error",
        text: "Enter the person's full name.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = {
      full_name: fullName,
      role: form.role.trim() || null,
      crew_id: form.crewId || null,
      active: form.active,
      notes: form.notes.trim() || null,
      shirt_size: form.shirtSize || null,
      jacket_size: form.jacketSize || null,
      glove_size: form.gloveSize || null,
      pants_size: form.pantsSize.trim() || null,
    };

    try {
      const { error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", employee.id);

      if (error) {
        throw new Error(error.message);
      }

      await loadData();
      setEditing(false);
      setMessage({
        tone: "success",
        text: "Employee profile updated successfully.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the employee profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  if (!employee) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
            <X size={30} className="mx-auto text-rose-500" />
            <h1 className="mt-4 text-2xl font-bold text-rose-900">
              Employee not found
            </h1>
            <p className="mt-2 text-sm text-rose-700">
              The employee profile could not be loaded.
            </p>
            <Link
              href="/people"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <ArrowLeft size={16} />
              Back to People
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const ppeComplete = hasCompletePpe(employee);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/people"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to People
              </Link>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-bold text-white">
                  {employee.full_name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("") || "P"}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                      {employee.full_name}
                    </h1>
                    <StatusBadge active={employee.active !== false} />
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    {employee.role || "Position not set"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <X size={16} />
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    Save Changes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <Edit3 size={16} />
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </section>

        {message ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {message.tone === "success" ? (
                <CheckCircle2 size={17} />
              ) : (
                <X size={17} />
              )}
              {message.text}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={<UsersRound size={20} />}
            label="Crew"
            value={crewLabel(selectedCrew)}
            detail={
              selectedCrew?.leading_hand
                ? `Leading hand: ${selectedCrew.leading_hand}`
                : "No leading hand recorded"
            }
          />
          <SummaryCard
            icon={
              employee.user_id ? (
                <UserCheck size={20} />
              ) : (
                <UserRoundX size={20} />
              )
            }
            label="Login"
            value={employee.user_id ? "Linked" : "Not linked"}
            detail={
              employee.user_id
                ? "System login assigned"
                : "Assign a login from Admin"
            }
          />
          <SummaryCard
            icon={<FolderKanban size={20} />}
            label="Projects"
            value={String(assignedProjects.length)}
            detail="Access follows the linked login"
          />
          <SummaryCard
            icon={<Shirt size={20} />}
            label="PPE"
            value={ppeComplete ? "Complete" : "Incomplete"}
            detail="Operational sizing only"
          />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 px-4 pt-4">
            <TabButton
              active={activeTab === "overview"}
              label="Overview"
              onClick={() => setActiveTab("overview")}
            />
            <TabButton
              active={activeTab === "training"}
              label="Training"
              onClick={() => setActiveTab("training")}
            />
            <TabButton
              active={activeTab === "ppe"}
              label="PPE"
              onClick={() => setActiveTab("ppe")}
            />
            <TabButton
              active={activeTab === "projects"}
              label="Projects"
              onClick={() => setActiveTab("projects")}
            />
            <TabButton
              active={activeTab === "history"}
              label="History"
              onClick={() => setActiveTab("history")}
            />
          </div>

          <div className="p-6">
            {activeTab === "overview" ? (
              <OverviewTab
                employee={employee}
                crews={crews}
                editing={editing}
                form={form}
                setForm={setForm}
              />
            ) : null}

            {activeTab === "training" ? (
              <ComingSoonPanel
                icon={<ShieldCheck size={24} />}
                title="Training & Certificates"
                description="This section will hold licences, VOCs, expiry dates and SharePoint document links. No certificate files will be stored in Supabase."
                actionLabel="Training register coming next"
              />
            ) : null}

            {activeTab === "ppe" ? (
              <PpeTab
                editing={editing}
                form={form}
                setForm={setForm}
              />
            ) : null}

            {activeTab === "projects" ? (
              <ProjectsTab
                projects={assignedProjects}
                loginLinked={Boolean(employee.user_id)}
              />
            ) : null}

            {activeTab === "history" ? (
              <HistoryTab employee={employee} />
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function OverviewTab({
  employee,
  crews,
  editing,
  form,
  setForm,
}: {
  employee: Employee;
  crews: Crew[];
  editing: boolean;
  form: ProfileForm;
  setForm: React.Dispatch<React.SetStateAction<ProfileForm>>;
}) {
  if (!editing) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <InfoSection
          title="Operational Profile"
          icon={<HardHat size={19} />}
        >
          <InfoRow label="Full name" value={employee.full_name} />
          <InfoRow
            label="Position / trade"
            value={employee.role || "Not set"}
          />
          <InfoRow
            label="Status"
            value={employee.active !== false ? "Active" : "Inactive"}
          />
          <InfoRow
            label="Linked login"
            value={employee.user_id ? "Yes" : "No"}
          />
        </InfoSection>

        <InfoSection
          title="Crew Allocation"
          icon={<UsersRound size={19} />}
        >
          <InfoRow
            label="Crew"
            value={crewLabel(
              crews.find((crew) => crew.id === employee.crew_id),
            )}
          />
          <InfoRow
            label="Leading hand"
            value={
              crews.find((crew) => crew.id === employee.crew_id)
                ?.leading_hand || "Not set"
            }
          />
        </InfoSection>

        <div className="lg:col-span-2">
          <InfoSection
            title="Operational Notes"
            icon={<BriefcaseBusiness size={19} />}
          >
            <p className="text-sm leading-6 text-slate-600">
              {employee.notes ||
                "No operational notes recorded. Do not use this field for private HR, medical or personal information."}
            </p>
          </InfoSection>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Operational information only. Do not enter medical, payroll, home
        address, emergency-contact or personal identification information.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name">
          <input
            value={form.fullName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                fullName: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Position / trade">
          <input
            value={form.role}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                role: event.target.value,
              }))
            }
            placeholder="e.g. Rigger, Crane Operator"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Crew">
          <SelectField
            value={form.crewId}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                crewId: value,
              }))
            }
            options={[
              { value: "", label: "Unassigned" },
              ...crews
                .filter((crew) => crew.active !== false)
                .map((crew) => ({
                  value: crew.id,
                  label: crewLabel(crew),
                })),
            ]}
          />
        </Field>

        <Field label="Status">
          <SelectField
            value={form.active ? "active" : "inactive"}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                active: value === "active",
              }))
            }
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </Field>
      </div>

      <Field label="Operational notes">
        <textarea
          rows={4}
          value={form.notes}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              notes: event.target.value,
            }))
          }
          placeholder="Operational notes only"
          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
        />
      </Field>
    </div>
  );
}

function PpeTab({
  editing,
  form,
  setForm,
}: {
  editing: boolean;
  form: ProfileForm;
  setForm: React.Dispatch<React.SetStateAction<ProfileForm>>;
}) {
  if (!editing) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PpeCard label="Shirt" value={form.shirtSize || "Not set"} />
        <PpeCard label="Jacket" value={form.jacketSize || "Not set"} />
        <PpeCard label="Gloves" value={form.gloveSize || "Not set"} />
        <PpeCard label="Pants" value={form.pantsSize || "Not set"} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Shirt size">
        <SelectField
          value={form.shirtSize}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              shirtSize: value,
            }))
          }
          options={[
            { value: "", label: "Not set" },
            ...SHIRT_SIZES.map((size) => ({
              value: size,
              label: size,
            })),
          ]}
        />
      </Field>

      <Field label="Jacket size">
        <SelectField
          value={form.jacketSize}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              jacketSize: value,
            }))
          }
          options={[
            { value: "", label: "Not set" },
            ...JACKET_SIZES.map((size) => ({
              value: size,
              label: size,
            })),
          ]}
        />
      </Field>

      <Field label="Glove size">
        <SelectField
          value={form.gloveSize}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              gloveSize: value,
            }))
          }
          options={[
            { value: "", label: "Not set" },
            ...GLOVE_SIZES.map((size) => ({
              value: size,
              label: size,
            })),
          ]}
        />
      </Field>

      <Field label="Pants size">
        <input
          value={form.pantsSize}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              pantsSize: event.target.value,
            }))
          }
          placeholder="e.g. 87R"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
        />
      </Field>
    </div>
  );
}

function ProjectsTab({
  projects,
  loginLinked,
}: {
  projects: Project[];
  loginLinked: boolean;
}) {
  if (!loginLinked) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h3 className="font-bold text-amber-950">No login linked</h3>
        <p className="mt-1 text-sm leading-6 text-amber-800">
          Project access is assigned to login accounts in Admin. Link a login
          to this employee before project allocations can appear here.
        </p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <FolderKanban size={28} className="mx-auto text-slate-400" />
        <h3 className="mt-4 text-lg font-bold text-slate-900">
          No project access
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Assign project access through the Admin page.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <div
          key={project.id}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          {project.project_number ? (
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {project.project_number}
            </div>
          ) : null}

          <h3 className="mt-1 font-bold text-slate-950">{project.name}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {project.status || "Status not set"}
          </p>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ employee }: { employee: Employee }) {
  return (
    <div className="space-y-3">
      <HistoryRow
        label="Profile created"
        value={formatDate(employee.created_at)}
      />
      <HistoryRow
        label="Current status"
        value={employee.active !== false ? "Active" : "Inactive"}
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="font-bold text-slate-900">Activity history</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Detailed profile, crew, PPE and training audit events can be added
          once the People activity table is created.
        </p>
      </div>
    </div>
  );
}

function ComingSoonPanel({
  icon,
  title,
  description,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        {description}
      </p>
      <div className="mt-4 text-sm font-semibold text-slate-700">
        {actionLabel}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-1 truncate text-lg font-bold text-slate-950">
            {value}
          </div>
          <div className="mt-1 text-xs text-slate-400">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function InfoSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-2 text-slate-700">
        {icon}
        <h3 className="font-bold">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-800">
        {value}
      </span>
    </div>
  );
}

function PpeCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const missing = value === "Not set";

  return (
    <div
      className={`rounded-2xl border p-5 ${
        missing
          ? "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div
        className={`text-sm font-semibold ${
          missing ? "text-rose-700" : "text-slate-500"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-2 text-2xl font-bold ${
          missing ? "text-rose-950" : "text-slate-950"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function HistoryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-semibold ${
        active
          ? "border-b-2 border-slate-950 text-slate-950"
          : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>
      {children}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-slate-700 outline-none ring-slate-200 focus:ring-2"
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </label>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
