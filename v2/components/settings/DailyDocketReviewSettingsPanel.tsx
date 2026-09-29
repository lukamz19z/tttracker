"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ShieldCheck, UserRoundCheck } from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";
import {
  DEFAULT_REVIEW_SETTINGS,
  loadDailyDocketReviewSettings,
} from "@/lib/operations/config";

type Reviewer = {
  id: string;
  user_id: string;
  project_id: string | null;
  receives_review: boolean;
};

type ClientContact = {
  id: string;
  name: string;
  email: string;
  receives_approval: boolean;
  is_active: boolean;
};

export function DailyDocketReviewSettingsPanel({
  organisationId,
  projectId = null,
}: {
  organisationId: string;
  projectId?: string | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [settings, setSettings] = useState(DEFAULT_REVIEW_SETTINGS);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [clientContacts, setClientContacts] = useState<ClientContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const resolved = await loadDailyDocketReviewSettings(supabase, {
        organisationId,
        projectId,
      });

      const [reviewerRes, contactRes] = await Promise.all([
        supabase
          .from("v2_daily_docket_reviewers")
          .select("id,user_id,project_id,receives_review")
          .eq("organisation_id", organisationId),
        projectId
          ? supabase
              .from("v2_daily_docket_client_contacts")
              .select("id,name,email,receives_approval,is_active")
              .eq("project_id", projectId)
              .order("sort_order")
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (cancelled) return;

      setSettings({
        internalReviewRequired: resolved.internalReviewRequired,
        clientApprovalEnabled: resolved.clientApprovalEnabled,
        requireSubmitterSignature: resolved.requireSubmitterSignature,
        clientCanRequestChanges: resolved.clientCanRequestChanges,
        publishAfterFinalApproval: resolved.publishAfterFinalApproval,
        clientContentKeys: resolved.clientContentKeys,
      });
      setReviewers((reviewerRes.data || []) as Reviewer[]);
      setClientContacts((contactRes.data || []) as ClientContact[]);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [organisationId, projectId, supabase]);

  async function save() {
    setSaving(true);
    setMessage("");

    const payload = {
      organisation_id: organisationId,
      project_id: projectId,
      internal_review_required: settings.internalReviewRequired,
      client_approval_enabled: settings.clientApprovalEnabled,
      require_submitter_signature: settings.requireSubmitterSignature,
      client_can_request_changes: settings.clientCanRequestChanges,
      publish_after_final_approval: settings.publishAfterFinalApproval,
      client_content_keys: settings.clientContentKeys,
      updated_by: (await supabase.auth.getUser()).data.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    let query = supabase
      .from("v2_daily_docket_review_settings")
      .select("id")
      .eq("organisation_id", organisationId);

    query = projectId
      ? query.eq("project_id", projectId)
      : query.is("project_id", null);

    const existing = await query.maybeSingle();

    const result = existing.data?.id
      ? await supabase
          .from("v2_daily_docket_review_settings")
          .update(payload)
          .eq("id", existing.data.id)
      : await supabase
          .from("v2_daily_docket_review_settings")
          .insert(payload);

    if (result.error) {
      setMessage(result.error.message);
    } else {
      setMessage("Review settings saved.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading Daily Docket review settings…
      </div>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-950">
            Daily Docket reviewing
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Organisation defaults can be overridden at project level. Internal
            reviewers remain selected individual TTTracker users; client approval
            is a separate optional stage.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Toggle
          label="Internal review required"
          description="Submitted dockets are locked and sent to configured internal reviewers."
          value={settings.internalReviewRequired}
          onChange={(value) =>
            setSettings((current) => ({
              ...current,
              internalReviewRequired: value,
            }))
          }
        />
        <Toggle
          label="Client approval"
          description="After internal approval, send the controlled client approval stage."
          value={settings.clientApprovalEnabled}
          onChange={(value) =>
            setSettings((current) => ({
              ...current,
              clientApprovalEnabled: value,
            }))
          }
        />
        <Toggle
          label="Submitter signature required"
          description="Require the authenticated organisation representative to sign before submission."
          value={settings.requireSubmitterSignature}
          onChange={(value) =>
            setSettings((current) => ({
              ...current,
              requireSubmitterSignature: value,
            }))
          }
        />
        <Toggle
          label="Client may request changes"
          description="Allow the client approval link to return the docket for controlled revision."
          value={settings.clientCanRequestChanges}
          disabled={!settings.clientApprovalEnabled}
          onChange={(value) =>
            setSettings((current) => ({
              ...current,
              clientCanRequestChanges: value,
            }))
          }
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 font-black text-slate-900">
            <UserRoundCheck size={17} />
            Internal reviewers
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {projectId ? "Project override" : "Organisation default"} · exact
            users, not role names.
          </p>
          <div className="mt-3 text-sm text-slate-700">
            {reviewers.filter((reviewer) =>
              projectId
                ? reviewer.project_id === projectId
                : reviewer.project_id === null,
            ).length}{" "}
            configured reviewer(s)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 font-black text-slate-900">
            <Check size={17} />
            Client approval contacts
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Client contacts are project-specific and only used when client
            approval is enabled.
          </p>
          <div className="mt-3 text-sm text-slate-700">
            {clientContacts.filter(
              (contact) => contact.is_active && contact.receives_approval,
            ).length}{" "}
            active contact(s)
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        {message ? (
          <div className="mr-auto text-sm font-semibold text-slate-600">
            {message}
          </div>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          {saving ? "Saving..." : "Save reviewing settings"}
        </button>
      </div>
    </section>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-2xl border p-4 ${
        value
          ? "border-blue-200 bg-blue-50"
          : "border-slate-200 bg-white"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block font-black text-slate-900">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}
