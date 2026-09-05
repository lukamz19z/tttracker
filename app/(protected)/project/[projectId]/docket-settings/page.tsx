"use client";

import {
  ArrowLeft,
  Check,
  FileText,
  Loader2,
  Mail,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createSupabaseBrowser } from "@/lib/supabase";

type RoleCode =
  | "admin"
  | "hseq"
  | "asset_manager"
  | "commercial"
  | "editor"
  | "crew"
  | "viewer";

type ProjectRow = {
  id: string;
  name: string;
  project_number: string | null;
};

type ApprovalRoleRow = {
  id: string;
  project_id: string;
  role: string;
  receives_bc_review: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type ClientContactRow = {
  id: string;
  project_id: string;
  name: string;
  email: string;
  company: string | null;
  receives_approval: boolean;
  receives_final: boolean;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type ClientContactDraft = {
  id?: string;
  name: string;
  email: string;
  company: string;
  receivesApproval: boolean;
  receivesFinal: boolean;
  active: boolean;
};

type MessageState = {
  tone: "success" | "error";
  text: string;
} | null;

type ClientContentKey =
  | "progress"
  | "workforce"
  | "raw_manhours"
  | "plant"
  | "mobilisation"
  | "travel"
  | "delays"
  | "missing_materials"
  | "received_materials"
  | "safety";

type ClientContentRow = {
  content_key: string;
  included_by_default: boolean;
};

const CLIENT_CONTENT_OPTIONS: Array<{
  value: ClientContentKey;
  label: string;
  detail: string;
}> = [
  { value: "progress", label: "Progress", detail: "Assembly and erection progress by tower section." },
  { value: "workforce", label: "Workforce", detail: "Personnel and recorded site hours." },
  { value: "raw_manhours", label: "Raw Manhours", detail: "Total raw manhours recorded for the docket." },
  { value: "plant", label: "Plant & Equipment", detail: "Plant and equipment recorded against the docket." },
  { value: "mobilisation", label: "Mobilisation", detail: "Recorded mobilisation details and crew involvement." },
  { value: "travel", label: "Travel", detail: "Recorded travel-in and travel-out information." },
  { value: "delays", label: "Delays / Disruptions", detail: "Recorded delay events, impacts and affected work." },
  { value: "missing_materials", label: "Missing Materials", detail: "Recorded missing-material searches and impacts." },
  { value: "received_materials", label: "Materials Received", detail: "Found, received and transferred material records." },
  { value: "safety", label: "Safety / Incidents", detail: "Recorded safety checks and incident information." },
];

const DEFAULT_CLIENT_CONTENT: ClientContentKey[] =
  CLIENT_CONTENT_OPTIONS.map((option) => option.value);

function isClientContentKey(value: string): value is ClientContentKey {
  return CLIENT_CONTENT_OPTIONS.some((option) => option.value === value);
}

const ROLE_OPTIONS: Array<{
  value: RoleCode;
  label: string;
  detail: string;
}> = [
  {
    value: "admin",
    label: "Administrator",
    detail: "System administrators assigned to this project.",
  },
  {
    value: "commercial",
    label: "Commercial",
    detail: "Commercial users assigned to this project.",
  },
  {
    value: "hseq",
    label: "HSEQ",
    detail: "HSEQ users assigned to this project.",
  },
  {
    value: "asset_manager",
    label: "Asset Manager",
    detail: "Asset managers assigned to this project.",
  },
  {
    value: "editor",
    label: "Editor",
    detail: "Editors assigned to this project.",
  },
  {
    value: "crew",
    label: "Crew / Field",
    detail: "Crew or field users assigned to this project.",
  },
  {
    value: "viewer",
    label: "Viewer",
    detail: "Read-only users assigned to this project.",
  },
];

const DEFAULT_APPROVAL_ROLES: RoleCode[] = ["admin", "commercial"];

function normaliseRole(value?: string | null): RoleCode | null {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (role === "administrator" || role === "site_admin") return "admin";
  if (role === "safety" || role === "safety_manager") return "hseq";
  if (role === "assets") return "asset_manager";
  if (role === "commercial_manager") return "commercial";
  if (role === "leading_hand" || role === "field") return "crew";

  if (
    [
      "admin",
      "hseq",
      "asset_manager",
      "commercial",
      "editor",
      "crew",
      "viewer",
    ].includes(role)
  ) {
    return role as RoleCode;
  }

  return null;
}

function blankContact(): ClientContactDraft {
  return {
    name: "",
    email: "",
    company: "",
    receivesApproval: true,
    receivesFinal: true,
    active: true,
  };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function DailyDocketApprovalSettingsPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = String(params?.projectId ?? "");
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>(
    DEFAULT_APPROVAL_ROLES,
  );
  const [contacts, setContacts] = useState<ClientContactDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingContacts, setSavingContacts] = useState(false);
  const [clientContent, setClientContent] = useState<ClientContentKey[]>(
    DEFAULT_CLIENT_CONTENT,
  );
  const [savingClientContent, setSavingClientContent] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  const loadSettings = useCallback(async () => {
    if (!projectId) {
      throw new Error("Missing project.");
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      return;
    }

    const [roleResult, projectResult] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("projects")
        .select("id, name, project_number")
        .eq("id", projectId)
        .single(),
    ]);

    if (roleResult.error) {
      throw new Error(roleResult.error.message);
    }

    const currentRole = normaliseRole(roleResult.data?.role);
    const isAdmin = currentRole === "admin";

    if (!isAdmin) {
      setCanManage(false);
      throw new Error(
        "Only an Administrator can manage Daily Docket approval settings.",
      );
    }

    setCanManage(true);

    if (projectResult.error || !projectResult.data) {
      throw new Error(
        projectResult.error?.message ?? "Could not load the project.",
      );
    }

    setProject(projectResult.data as ProjectRow);

    const [approvalRolesResult, contactsResult, clientContentResult] =
      await Promise.all([
      supabase
        .from("project_docket_approval_roles")
        .select(
          "id, project_id, role, receives_bc_review, created_at, updated_at",
        )
        .eq("project_id", projectId)
        .eq("receives_bc_review", true),
      supabase
        .from("project_docket_contacts")
        .select(
          "id, project_id, name, email, company, receives_approval, receives_final, active, created_at, updated_at",
        )
        .eq("project_id", projectId)
        .order("name"),
      supabase
        .from("project_docket_client_content")
        .select("content_key, included_by_default")
        .eq("project_id", projectId),
    ]);

    if (approvalRolesResult.error) {
      const missingTable =
        approvalRolesResult.error.message
          .toLowerCase()
          .includes("project_docket_approval_roles") ||
        approvalRolesResult.error.code === "42P01";

      throw new Error(
        missingTable
          ? "Daily Docket approval role settings have not been created in Supabase yet."
          : approvalRolesResult.error.message,
      );
    }

    if (contactsResult.error) {
      throw new Error(contactsResult.error.message);
    }

    if (clientContentResult.error) {
      throw new Error(clientContentResult.error.message);
    }

    const savedClientContent = (
      (clientContentResult.data ?? []) as ClientContentRow[]
    )
      .filter(
        (row) =>
          row.included_by_default && isClientContentKey(row.content_key),
      )
      .map((row) => row.content_key as ClientContentKey);

    setClientContent(
      (clientContentResult.data ?? []).length > 0
        ? savedClientContent
        : DEFAULT_CLIENT_CONTENT,
    );

    const savedRoles = (
      (approvalRolesResult.data ?? []) as ApprovalRoleRow[]
    )
      .map((row) => normaliseRole(row.role))
      .filter((role): role is RoleCode => Boolean(role));

    setSelectedRoles(
      savedRoles.length > 0
        ? [...new Set(savedRoles)]
        : DEFAULT_APPROVAL_ROLES,
    );

    setContacts(
      ((contactsResult.data ?? []) as ClientContactRow[]).map((row) => ({
        id: row.id,
        name: row.name ?? "",
        email: row.email ?? "",
        company: row.company ?? "",
        receivesApproval: row.receives_approval ?? true,
        receivesFinal: row.receives_final ?? true,
        active: row.active ?? true,
      })),
    );
  }, [projectId, router, supabase]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadSettings();
      } catch (error) {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Could not load Daily Docket approval settings.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  function toggleRole(role: RoleCode) {
    setMessage(null);
    setSelectedRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  }

  async function saveApprovalRoles() {
    if (!canManage || !projectId) return;

    if (selectedRoles.length === 0) {
      setMessage({
        tone: "error",
        text: "Select at least one BC approval recipient role.",
      });
      return;
    }

    setSavingRoles(true);
    setMessage(null);

    try {
      const deleteResult = await supabase
        .from("project_docket_approval_roles")
        .delete()
        .eq("project_id", projectId);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }

      const insertResult = await supabase
        .from("project_docket_approval_roles")
        .insert(
          selectedRoles.map((role) => ({
            project_id: projectId,
            role,
            receives_bc_review: true,
          })),
        );

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }

      setMessage({
        tone: "success",
        text: "BC approval recipients updated.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save BC approval recipients.",
      });
    } finally {
      setSavingRoles(false);
    }
  }

  function toggleClientContent(contentKey: ClientContentKey) {
    setMessage(null);
    setClientContent((current) =>
      current.includes(contentKey)
        ? current.filter((item) => item !== contentKey)
        : [...current, contentKey],
    );
  }

  async function saveClientContentDefaults() {
    if (!canManage || !projectId) return;

    if (clientContent.length === 0) {
      setMessage({
        tone: "error",
        text: "Select at least one section for the default client Daily Docket.",
      });
      return;
    }

    setSavingClientContent(true);
    setMessage(null);

    try {
      const payload = CLIENT_CONTENT_OPTIONS.map((option) => ({
        project_id: projectId,
        content_key: option.value,
        included_by_default: clientContent.includes(option.value),
        updated_at: new Date().toISOString(),
      }));

      const result = await supabase
        .from("project_docket_client_content")
        .upsert(payload, { onConflict: "project_id,content_key" });

      if (result.error) {
        throw new Error(result.error.message);
      }

      setMessage({
        tone: "success",
        text: "Client Daily Docket defaults updated.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save client Daily Docket defaults.",
      });
    } finally {
      setSavingClientContent(false);
    }
  }

  function addContact() {
    setContacts((current) => [...current, blankContact()]);
    setMessage(null);
  }

  function updateContact(
    index: number,
    patch: Partial<ClientContactDraft>,
  ) {
    setContacts((current) =>
      current.map((contact, currentIndex) =>
        currentIndex === index ? { ...contact, ...patch } : contact,
      ),
    );
    setMessage(null);
  }

  function removeContact(index: number) {
    setContacts((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
    setMessage(null);
  }

  async function saveClientContacts(event?: FormEvent) {
    event?.preventDefault();

    if (!canManage || !projectId) return;

    const cleaned = contacts.map((contact) => ({
      ...contact,
      name: contact.name.trim(),
      email: contact.email.trim().toLowerCase(),
      company: contact.company.trim(),
    }));

    const incomplete = cleaned.find(
      (contact) => !contact.name || !contact.email,
    );

    if (incomplete) {
      setMessage({
        tone: "error",
        text: "Each client contact needs a name and email address.",
      });
      return;
    }

    const invalidEmail = cleaned.find(
      (contact) => !isEmail(contact.email),
    );

    if (invalidEmail) {
      setMessage({
        tone: "error",
        text: `Enter a valid email address for ${invalidEmail.name || "the client contact"}.`,
      });
      return;
    }

    const emails = cleaned.map((contact) => contact.email);
    const duplicateEmail = emails.find(
      (email, index) => emails.indexOf(email) !== index,
    );

    if (duplicateEmail) {
      setMessage({
        tone: "error",
        text: `The email address ${duplicateEmail} has been entered more than once.`,
      });
      return;
    }

    const activeContacts = cleaned.filter((contact) => contact.active);
    if (
      activeContacts.length > 0 &&
      !activeContacts.some((contact) => contact.receivesApproval)
    ) {
      setMessage({
        tone: "error",
        text: "At least one active client contact must receive approval requests.",
      });
      return;
    }

    setSavingContacts(true);
    setMessage(null);

    try {
      const existingResult = await supabase
        .from("project_docket_contacts")
        .select("id")
        .eq("project_id", projectId);

      if (existingResult.error) {
        throw new Error(existingResult.error.message);
      }

      const existingIds = new Set(
        (existingResult.data ?? []).map((row) => String(row.id)),
      );
      const retainedIds = new Set(
        cleaned
          .map((contact) => contact.id)
          .filter((id): id is string => Boolean(id)),
      );

      const idsToDelete = [...existingIds].filter(
        (id) => !retainedIds.has(id),
      );

      if (idsToDelete.length > 0) {
        const deleteResult = await supabase
          .from("project_docket_contacts")
          .delete()
          .in("id", idsToDelete);

        if (deleteResult.error) {
          throw new Error(deleteResult.error.message);
        }
      }

      const nextContacts: ClientContactDraft[] = [];

      for (const contact of cleaned) {
        const payload = {
          project_id: projectId,
          name: contact.name,
          email: contact.email,
          company: contact.company || null,
          receives_approval: contact.receivesApproval,
          receives_final: contact.receivesFinal,
          active: contact.active,
        };

        if (contact.id) {
          const updateResult = await supabase
            .from("project_docket_contacts")
            .update(payload)
            .eq("id", contact.id)
            .eq("project_id", projectId)
            .select(
              "id, project_id, name, email, company, receives_approval, receives_final, active",
            )
            .single();

          if (updateResult.error || !updateResult.data) {
            throw new Error(
              updateResult.error?.message ??
                "Could not update a client contact.",
            );
          }

          const row = updateResult.data as ClientContactRow;
          nextContacts.push({
            id: row.id,
            name: row.name,
            email: row.email,
            company: row.company ?? "",
            receivesApproval: row.receives_approval,
            receivesFinal: row.receives_final,
            active: row.active,
          });
        } else {
          const insertResult = await supabase
            .from("project_docket_contacts")
            .insert(payload)
            .select(
              "id, project_id, name, email, company, receives_approval, receives_final, active",
            )
            .single();

          if (insertResult.error || !insertResult.data) {
            throw new Error(
              insertResult.error?.message ??
                "Could not create a client contact.",
            );
          }

          const row = insertResult.data as ClientContactRow;
          nextContacts.push({
            id: row.id,
            name: row.name,
            email: row.email,
            company: row.company ?? "",
            receivesApproval: row.receives_approval,
            receivesFinal: row.receives_final,
            active: row.active,
          });
        }
      }

      setContacts(nextContacts);
      setMessage({
        tone: "success",
        text: "Client approval contacts updated.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save client approval contacts.",
      });
    } finally {
      setSavingContacts(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck size={18} />
              <span className="text-sm font-semibold uppercase tracking-wider">
                Daily Dockets
              </span>
            </div>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Approval Settings
            </h1>

            {project ? (
              <p className="mt-2 text-sm font-medium text-slate-500">
                {project.name}
                {project.project_number ? ` · ${project.project_number}` : ""}
              </p>
            ) : null}
          </div>

          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Project
          </Link>
        </div>

        {message ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.text}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users size={19} className="text-slate-500" />
                <h2 className="text-lg font-bold text-slate-950">
                  BC Approval Recipients
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Selected roles receive the BC review email when a docket is
                submitted.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void saveApprovalRoles()}
              disabled={savingRoles || !canManage}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingRoles ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Recipients
            </button>
          </div>

          <div className="grid gap-3 p-6 md:grid-cols-2">
            {ROLE_OPTIONS.map((role) => {
              const selected = selectedRoles.includes(role.value);

              return (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => toggleRole(role.value)}
                  disabled={!canManage}
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-slate-950 bg-slate-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      selected
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-300 bg-white text-transparent"
                    }`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>

                  <span>
                    <span className="block text-sm font-bold text-slate-900">
                      {role.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {role.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText size={19} className="text-slate-500" />
                <h2 className="text-lg font-bold text-slate-950">
                  Client Daily Docket Defaults
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Choose the information normally included when this project&apos;s
                Daily Dockets are issued to the client. The BC reviewer can
                override these selections for an individual revision.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void saveClientContentDefaults()}
              disabled={savingClientContent || !canManage}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingClientContent ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Defaults
            </button>
          </div>

          <div className="grid gap-3 p-6 md:grid-cols-2">
            {CLIENT_CONTENT_OPTIONS.map((option) => {
              const selected = clientContent.includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleClientContent(option.value)}
                  disabled={!canManage}
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-slate-950 bg-slate-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      selected
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-300 bg-white text-transparent"
                    }`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>

                  <span>
                    <span className="block text-sm font-bold text-slate-900">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {option.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <form
          onSubmit={(event) => void saveClientContacts(event)}
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Mail size={19} className="text-slate-500" />
                <h2 className="text-lg font-bold text-slate-950">
                  Client Approval Contacts
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Client contacts receive approval requests and final signed
                dockets.
              </p>
            </div>

            <button
              type="button"
              onClick={addContact}
              disabled={!canManage}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Plus size={16} />
              Add Contact
            </button>
          </div>

          <div className="p-6">
            {contacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
                <Mail size={28} className="mx-auto text-slate-300" />
                <h3 className="mt-3 font-bold text-slate-900">
                  No client contacts
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Add the client representatives who will receive Daily Docket
                  approvals.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {contacts.map((contact, index) => (
                  <div
                    key={contact.id ?? `new-${index}`}
                    className="rounded-2xl border border-slate-200 p-5"
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                      <Field label="Name">
                        <input
                          value={contact.name}
                          onChange={(event) =>
                            updateContact(index, {
                              name: event.target.value,
                            })
                          }
                          disabled={!canManage}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2 disabled:bg-slate-50"
                        />
                      </Field>

                      <Field label="Email">
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(event) =>
                            updateContact(index, {
                              email: event.target.value,
                            })
                          }
                          disabled={!canManage}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2 disabled:bg-slate-50"
                        />
                      </Field>

                      <Field label="Company">
                        <input
                          value={contact.company}
                          onChange={(event) =>
                            updateContact(index, {
                              company: event.target.value,
                            })
                          }
                          disabled={!canManage}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2 disabled:bg-slate-50"
                        />
                      </Field>

                      <button
                        type="button"
                        onClick={() => removeContact(index)}
                        disabled={!canManage}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                        aria-label="Remove client contact"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-5 border-t border-slate-100 pt-4">
                      <CheckOption
                        label="Approval requests"
                        checked={contact.receivesApproval}
                        onChange={(checked) =>
                          updateContact(index, {
                            receivesApproval: checked,
                          })
                        }
                        disabled={!canManage}
                      />

                      <CheckOption
                        label="Final signed docket"
                        checked={contact.receivesFinal}
                        onChange={(checked) =>
                          updateContact(index, {
                            receivesFinal: checked,
                          })
                        }
                        disabled={!canManage}
                      />

                      <CheckOption
                        label="Active"
                        checked={contact.active}
                        onChange={(checked) =>
                          updateContact(index, { active: checked })
                        }
                        disabled={!canManage}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end border-t border-slate-200 pt-5">
              <button
                type="submit"
                disabled={savingContacts || !canManage}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingContacts ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save Client Contacts
              </button>
            </div>
          </div>
        </form>
    </div>
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

function CheckOption({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-300"
      />
      {label}
    </label>
  );
}
