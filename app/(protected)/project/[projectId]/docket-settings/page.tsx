"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { createSupabaseBrowser } from "@/lib/supabase";

type ProjectRecord = {
  id: string;
  name: string | null;
  project_number: string | null;
  client: string | null;
};

type DocketContact = {
  id?: string;
  name: string;
  email: string;
  company: string;
  receives_approval: boolean;
  receives_final: boolean;
  active: boolean;
};

function blankContact(clientName = ""): DocketContact {
  return {
    name: "",
    email: "",
    company: clientName,
    receives_approval: true,
    receives_final: true,
    active: true,
  };
}

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  const email = normaliseEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function DocketApprovalSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params.projectId ?? "");
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [contacts, setContacts] = useState<DocketContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [projectId, supabase]);

  async function loadSettings() {
    setLoading(true);
    setMessage("");
    setMessageType("");

    try {
      const [{ data: projectData, error: projectError }, { data: contactData, error: contactError }] =
        await Promise.all([
          supabase
            .from("projects")
            .select("id,name,project_number,client")
            .eq("id", projectId)
            .single(),
          supabase
            .from("project_docket_contacts")
            .select(
              "id,name,email,company,receives_approval,receives_final,active",
            )
            .eq("project_id", projectId)
            .order("active", { ascending: false })
            .order("name"),
        ]);

      if (projectError || !projectData) {
        throw new Error(projectError?.message || "Project could not be loaded.");
      }

      if (contactError) {
        throw new Error(contactError.message);
      }

      const loadedProject = projectData as ProjectRecord;
      setProject(loadedProject);

      const loadedContacts = (contactData || []).map((row) => ({
        id: String(row.id),
        name: String(row.name || ""),
        email: String(row.email || ""),
        company: String(row.company || ""),
        receives_approval: Boolean(row.receives_approval),
        receives_final: Boolean(row.receives_final),
        active: row.active !== false,
      }));

      setContacts(
        loadedContacts.length > 0
          ? loadedContacts
          : [blankContact(String(loadedProject.client || ""))],
      );
    } catch (error) {
      console.error("DAILY DOCKET APPROVAL SETTINGS LOAD ERROR:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Approval settings could not be loaded.",
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  function updateContact<K extends keyof DocketContact>(
    index: number,
    key: K,
    value: DocketContact[K],
  ) {
    setContacts((current) =>
      current.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, [key]: value } : contact,
      ),
    );
  }

  function addContact() {
    setContacts((current) => [
      ...current,
      blankContact(String(project?.client || "")),
    ]);
  }

  async function removeContact(index: number) {
    const contact = contacts[index];
    if (!contact) return;

    if (!contact.id) {
      setContacts((current) => current.filter((_, i) => i !== index));
      return;
    }

    const confirmed = window.confirm(
      `Remove ${contact.name || contact.email || "this contact"} from Daily Docket approvals?`,
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    setMessageType("");

    try {
      const { error } = await supabase
        .from("project_docket_contacts")
        .delete()
        .eq("id", contact.id)
        .eq("project_id", projectId);

      if (error) throw error;

      setContacts((current) => current.filter((_, i) => i !== index));
      setMessage("Contact removed.");
      setMessageType("success");
    } catch (error) {
      console.error("DAILY DOCKET CONTACT DELETE ERROR:", error);
      setMessage(
        error instanceof Error ? error.message : "Contact could not be removed.",
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    setMessage("");
    setMessageType("");

    const completedContacts = contacts.filter(
      (contact) =>
        contact.name.trim() ||
        contact.email.trim() ||
        contact.company.trim(),
    );

    for (const contact of completedContacts) {
      if (!contact.name.trim()) {
        setMessage("Each Daily Docket contact requires a name.");
        setMessageType("error");
        return;
      }

      if (!isValidEmail(contact.email)) {
        setMessage(
          `${contact.name.trim() || "Each contact"} requires a valid email address.`,
        );
        setMessageType("error");
        return;
      }

      if (!contact.receives_approval && !contact.receives_final) {
        setMessage(
          `${contact.name.trim()} must receive either approval requests, final dockets, or both.`,
        );
        setMessageType("error");
        return;
      }
    }

    const emailSet = new Set<string>();

    for (const contact of completedContacts) {
      const email = normaliseEmail(contact.email);

      if (emailSet.has(email)) {
        setMessage(`Duplicate email address: ${contact.email}`);
        setMessageType("error");
        return;
      }

      emailSet.add(email);
    }

    const approvalContacts = completedContacts.filter(
      (contact) => contact.active && contact.receives_approval,
    );

    if (completedContacts.length > 0 && approvalContacts.length === 0) {
      setMessage(
        "At least one active contact must receive Daily Docket approval requests.",
      );
      setMessageType("error");
      return;
    }

    setSaving(true);

    try {
      for (const contact of completedContacts) {
        const payload = {
          project_id: projectId,
          name: contact.name.trim(),
          email: normaliseEmail(contact.email),
          company: contact.company.trim() || null,
          receives_approval: contact.receives_approval,
          receives_final: contact.receives_final,
          active: contact.active,
          updated_at: new Date().toISOString(),
        };

        if (contact.id) {
          const { error } = await supabase
            .from("project_docket_contacts")
            .update(payload)
            .eq("id", contact.id)
            .eq("project_id", projectId);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("project_docket_contacts")
            .insert(payload);

          if (error) throw error;
        }
      }

      setMessage("Approval settings saved.");
      setMessageType("success");
      await loadSettings();
    } catch (error) {
      console.error("DAILY DOCKET APPROVAL SETTINGS SAVE ERROR:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Approval settings could not be saved.",
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  const approvalCount = contacts.filter(
    (contact) =>
      contact.active &&
      contact.receives_approval &&
      contact.name.trim() &&
      isValidEmail(contact.email),
  ).length;

  const finalCount = contacts.filter(
    (contact) =>
      contact.active &&
      contact.receives_final &&
      contact.name.trim() &&
      isValidEmail(contact.email),
  ).length;

  if (loading) {
    return (
      <div className="p-4 md:p-8 min-h-screen bg-slate-50">
        Loading approval settings...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Daily Docket Approval Settings
            </h1>

            {project && (
              <div className="text-sm text-slate-500 mt-2">
                {[project.project_number, project.name]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => router.back()}
            className="border border-slate-300 bg-white px-5 py-3 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SummaryCard
            label="Approval Recipients"
            value={approvalCount}
          />
          <SummaryCard
            label="Final Docket Recipients"
            value={finalCount}
          />
          <SummaryCard
            label="Client"
            value={project?.client || "Not set"}
          />
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 md:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-xl font-semibold text-slate-900">
              Client Contacts
            </h2>

            <button
              type="button"
              onClick={addContact}
              className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-black"
            >
              + Add Contact
            </button>
          </div>

          <div className="p-4 md:p-6 space-y-3">
            {contacts.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-500 bg-slate-50">
                No Daily Docket contacts have been configured.
              </div>
            ) : (
              contacts.map((contact, index) => (
                <div
                  key={contact.id || `contact-${index}`}
                  className={`rounded-2xl border p-4 md:p-5 ${
                    contact.active
                      ? "border-slate-200 bg-white"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="grid lg:grid-cols-[1fr_1.2fr_1fr] gap-3">
                    <Field
                      label="Name"
                      value={contact.name}
                      placeholder="Client representative"
                      disabled={saving}
                      onChange={(value) =>
                        updateContact(index, "name", value)
                      }
                    />

                    <Field
                      label="Email"
                      type="email"
                      value={contact.email}
                      placeholder="name@company.com"
                      disabled={saving}
                      onChange={(value) =>
                        updateContact(index, "email", value)
                      }
                    />

                    <Field
                      label="Company"
                      value={contact.company}
                      placeholder={project?.client || "Client"}
                      disabled={saving}
                      onChange={(value) =>
                        updateContact(index, "company", value)
                      }
                    />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-4 pt-4 border-t border-slate-100">
                    <div className="flex flex-wrap gap-4">
                      <Toggle
                        label="Approval Requests"
                        checked={contact.receives_approval}
                        disabled={saving}
                        onChange={(checked) =>
                          updateContact(
                            index,
                            "receives_approval",
                            checked,
                          )
                        }
                      />

                      <Toggle
                        label="Final Dockets"
                        checked={contact.receives_final}
                        disabled={saving}
                        onChange={(checked) =>
                          updateContact(
                            index,
                            "receives_final",
                            checked,
                          )
                        }
                      />

                      <Toggle
                        label="Active"
                        checked={contact.active}
                        disabled={saving}
                        onChange={(checked) =>
                          updateContact(index, "active", checked)
                        }
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => void removeContact(index)}
                      disabled={saving}
                      className="text-sm font-semibold text-rose-700 hover:text-rose-800 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="grid md:grid-cols-3 gap-4">
            <WorkflowStep
              number="1"
              title="BC Approval"
              text="Commercial or Supervisor reviews the submitted docket."
            />
            <WorkflowStep
              number="2"
              title="Client Approval"
              text="Selected contacts receive the secure approval and signature request."
            />
            <WorkflowStep
              number="3"
              title="Final Docket"
              text="The signed final PDF is distributed to the selected recipients."
            />
          </div>
        </section>

        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              messageType === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {message}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Approval Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900 mt-1 truncate">
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="border border-slate-300 rounded-xl px-3 py-2.5 w-full bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
      />
    </div>
  );
}

function Toggle({
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
    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}

function WorkflowStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 shrink-0 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="text-sm text-slate-500 mt-1">{text}</div>
      </div>
    </div>
  );
}
