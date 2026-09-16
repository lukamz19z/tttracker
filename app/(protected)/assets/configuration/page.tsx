"use client";

import {
  Bell,
  CheckCircle2,
  FolderSync,
  HardDrive,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  FileCog,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowser } from "@/lib/supabase";

type Drive = {
  id: string;
  name: string;
  webUrl?: string | null;
};

type SettingsRow = {
  id: boolean;
  sharepoint_site_id: string | null;
  sharepoint_site_name: string | null;
  sharepoint_site_url: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_drive_name: string | null;
  sharepoint_base_folder: string;
  vehicle_folder_name: string;
  plant_folder_name: string;
  superseded_folder_name: string;
  document_folders: Record<string, string>;
  max_file_size_mb: number;
  notifications_enabled: boolean;
};

type SettingsPayload = {
  settings?: SettingsRow;
  canConfigure?: boolean;
  site?: {
    id: string;
    displayName?: string | null;
    webUrl?: string | null;
  };
  drives?: Drive[];
  error?: string;
};

const DEFAULT_FOLDERS = {
  compliance: "Compliance",
  service: "Service & Repairs",
  invoice: "Invoices",
  inspection: "Inspections",
  manual: "Manuals",
  photo: "Photos",
  other: "Other",
};

export default function AssetsConfigurationPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);

  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Sign in again.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);

      if (
        init.body &&
        typeof init.body === "string" &&
        !headers.has("Content-Type")
      ) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(url, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [supabase],
  );

  const load = useCallback(async () => {
    const response = await apiFetch("/api/assets/configuration");
    const payload = (await response.json()) as SettingsPayload;

    if (!response.ok || !payload.settings) {
      throw new Error(
        payload.error || "Asset configuration could not be loaded.",
      );
    }

    setSettings({
      ...payload.settings,
      document_folders: {
        ...DEFAULT_FOLDERS,
        ...(payload.settings.document_folders ?? {}),
      },
    });
    setCanConfigure(Boolean(payload.canConfigure));
  }, [apiFetch]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (error) {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Asset configuration could not be loaded.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function discover() {
    setDiscovering(true);
    setMessage(null);

    try {
      const response = await apiFetch(
        "/api/assets/configuration?discover=1",
      );
      const payload = (await response.json()) as SettingsPayload;

      if (!response.ok) {
        throw new Error(
          payload.error || "SharePoint libraries could not be loaded.",
        );
      }

      setDrives(payload.drives ?? []);
      setMessage({
        tone: "success",
        text: `Connected to ${
          payload.site?.displayName || "BC Contracting SharePoint"
        }. Select the document library below.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "SharePoint libraries could not be loaded.",
      });
    } finally {
      setDiscovering(false);
    }
  }

  async function save() {
    if (!settings) return;

    if (!settings.sharepoint_drive_id) {
      setMessage({
        tone: "error",
        text: "Discover SharePoint and select a document library first.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/assets/configuration", {
        method: "POST",
        body: JSON.stringify({
          driveId: settings.sharepoint_drive_id,
          baseFolder: settings.sharepoint_base_folder,
          vehicleFolder: settings.vehicle_folder_name,
          plantFolder: settings.plant_folder_name,
          supersededFolder: settings.superseded_folder_name,
          maxFileSizeMb: settings.max_file_size_mb,
          notificationsEnabled: settings.notifications_enabled,
          documentFolders: settings.document_folders,
        }),
      });

      const payload = (await response.json()) as SettingsPayload;

      if (!response.ok || !payload.settings) {
        throw new Error(
          payload.error || "Asset configuration could not be saved.",
        );
      }

      setSettings({
        ...payload.settings,
        document_folders: {
          ...DEFAULT_FOLDERS,
          ...(payload.settings.document_folders ?? {}),
        },
      });

      setMessage({
        tone: "success",
        text: "Asset SharePoint configuration saved.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Asset configuration could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function syncFolders() {
    setSyncing(true);
    setMessage(null);

    try {
      const response = await apiFetch("/api/assets/sync-folders", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const payload = (await response.json()) as {
        synced?: number;
        failed?: number;
        total?: number;
        failures?: Array<{ label: string; error: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "Asset folders could not be synchronised.",
        );
      }

      const failures = payload.failures ?? [];
      setMessage({
        tone: failures.length > 0 ? "error" : "success",
        text:
          failures.length > 0
            ? `${payload.synced ?? 0} of ${payload.total ?? 0} asset folders synced. ${failures.length} failed. First failure: ${failures[0]?.label} — ${failures[0]?.error}`
            : `${payload.synced ?? 0} asset folder${
                payload.synced === 1 ? "" : "s"
              } synchronised with SharePoint.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Asset folders could not be synchronised.",
      });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 size={30} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-8 text-sm font-semibold text-rose-700">
        Asset configuration could not be loaded.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
            <Settings size={22} />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Assets
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              Configuration
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Configure the controlled SharePoint library once. Asset folders are
              then created and renamed automatically from stable SharePoint item IDs.
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {!canConfigure ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          You can view the Asset configuration, but only an Administrator can
          change SharePoint storage settings.
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              SharePoint Storage
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Asset PDFs, invoices, manuals and compliance documents are stored here.
            </p>
          </div>

          {canConfigure ? (
            <button
              type="button"
              onClick={() => void discover()}
              disabled={discovering}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
            >
              {discovering ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Discover SharePoint
            </button>
          ) : null}
        </div>

        <div className="grid gap-5 p-6 lg:grid-cols-2">
          <Field label="Document library">
            <select
              value={settings.sharepoint_drive_id ?? ""}
              onChange={(event) => {
                const selected = drives.find(
                  (drive) => drive.id === event.target.value,
                );

                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        sharepoint_drive_id: event.target.value || null,
                        sharepoint_drive_name: selected?.name ?? null,
                      }
                    : current,
                );
              }}
              disabled={!canConfigure}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none disabled:bg-slate-50"
            >
              <option value="">
                {settings.sharepoint_drive_name
                  ? `${settings.sharepoint_drive_name} (current)`
                  : "Discover and select library"}
              </option>
              {drives.map((drive) => (
                <option key={drive.id} value={drive.id}>
                  {drive.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Base folder">
            <TextInput
              value={settings.sharepoint_base_folder}
              disabled={!canConfigure}
              onChange={(value) =>
                setSettings((current) =>
                  current
                    ? { ...current, sharepoint_base_folder: value }
                    : current,
                )
              }
            />
          </Field>

          <Field label="Vehicle folder">
            <TextInput
              value={settings.vehicle_folder_name}
              disabled={!canConfigure}
              onChange={(value) =>
                setSettings((current) =>
                  current
                    ? { ...current, vehicle_folder_name: value }
                    : current,
                )
              }
            />
          </Field>

          <Field label="Plant folder">
            <TextInput
              value={settings.plant_folder_name}
              disabled={!canConfigure}
              onChange={(value) =>
                setSettings((current) =>
                  current
                    ? { ...current, plant_folder_name: value }
                    : current,
                )
              }
            />
          </Field>

          <Field label="Superseded folder">
            <TextInput
              value={settings.superseded_folder_name}
              disabled={!canConfigure}
              onChange={(value) =>
                setSettings((current) =>
                  current
                    ? { ...current, superseded_folder_name: value }
                    : current,
                )
              }
            />
          </Field>

          <Field label="Maximum upload size (MB)">
            <input
              type="number"
              min={1}
              max={250}
              value={settings.max_file_size_mb}
              disabled={!canConfigure}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        max_file_size_mb: Number(event.target.value) || 50,
                      }
                    : current,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none disabled:bg-slate-50"
            />
          </Field>

          <Field label="Asset Manager notifications">
            <button
              type="button"
              disabled={!canConfigure}
              onClick={() =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        notifications_enabled:
                          !current.notifications_enabled,
                      }
                    : current,
                )
              }
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-black ${
                settings.notifications_enabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              } disabled:opacity-60`}
            >
              <span className="inline-flex items-center gap-2">
                <Bell size={16} />
                {settings.notifications_enabled ? "Enabled" : "Disabled"}
              </span>
              {settings.notifications_enabled ? (
                <CheckCircle2 size={17} />
              ) : null}
            </button>
          </Field>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-lg font-black text-slate-950">
            Asset Document Folders
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Each vehicle or plant folder uses these direct subfolders.
          </p>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(DEFAULT_FOLDERS).map(([key, fallback]) => (
            <Field
              key={key}
              label={key.replace(/\b\w/g, (character) =>
                character.toUpperCase(),
              )}
            >
              <TextInput
                value={settings.document_folders[key] || fallback}
                disabled={!canConfigure}
                onChange={(value) =>
                  setSettings((current) =>
                    current
                      ? {
                          ...current,
                          document_folders: {
                            ...current.document_folders,
                            [key]: value,
                          },
                        }
                      : current,
                  )
                }
              />
            </Field>
          ))}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 font-mono text-xs leading-6 text-slate-600">
            <div>{settings.sharepoint_base_folder || "Assets"}</div>
            <div>├── {settings.vehicle_folder_name || "Vehicles"}</div>
            <div>│&nbsp;&nbsp;&nbsp;└── LV-001 - Ford Ranger - ABC123</div>
            <div>
              │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──{" "}
              {settings.document_folders.compliance}
            </div>
            <div>
              │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──{" "}
              {settings.document_folders.service}
            </div>
            <div>
              │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├──{" "}
              {settings.document_folders.invoice}
            </div>
            <div>
              │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── …
            </div>
            <div>
              │&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── {settings.superseded_folder_name || "Superseded"}
            </div>
            <div>└── {settings.plant_folder_name || "Plant"}</div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
              <FileCog size={21} />
            </div>
            <div>
              <h2 className="font-black text-slate-950">Document Types & Naming</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Configure Insurance, Rego, Service, Risk Assessment, CraneSafe, 10 Year, User Manual and future controlled document naming rules.
              </p>
            </div>
          </div>
          <Link
            href="/assets/configuration/document-types"
            className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
          >
            Open Document Types
          </Link>
        </div>
      </section>

      {canConfigure ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <HardDrive size={22} className="mt-0.5 text-slate-400" />
              <div>
                <h2 className="font-black text-slate-950">
                  Save Configuration
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Save the library and folder structure before provisioning folders.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Configuration
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <FolderSync size={22} className="mt-0.5 text-slate-400" />
              <div>
                <h2 className="font-black text-slate-950">
                  Sync Asset Folders
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Creates missing folders and renames existing folders using their
                  stable SharePoint item IDs.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void syncFolders()}
              disabled={syncing || !settings.sharepoint_drive_id}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FolderSync size={16} />
              )}
              Sync All Vehicle & Plant Folders
            </button>
          </div>
        </section>
      ) : null}
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
      <span className="mb-2 block text-sm font-black text-slate-800">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none disabled:bg-slate-50"
    />
  );
}
