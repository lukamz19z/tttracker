"use client";

import {
  ArrowLeft,
  CalendarCheck2,
  FileCheck2,
  Gauge,
  HardHat,
  Loader2,
  PenTool,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Upload,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { buildAssetDocumentFileName } from "@/lib/assets/document-naming";
import type {
  AssetDocumentTypeRow,
  AssetRecord,
  AssetType,
} from "@/lib/assets/types";
import { createSupabaseBrowser } from "@/lib/supabase";

type VehicleAsset = AssetRecord & {
  vehicle_id: string | null;
  vehicle_rego: string | null;
};

type PlantAsset = AssetRecord & {
  asset_id: string | null;
  rego: string | null;
};

type ProjectOption = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type CrewOption = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type BootstrapPayload = {
  vehicles: VehicleAsset[];
  plant: PlantAsset[];
  projects: ProjectOption[];
  crews: CrewOption[];
  documentTypes: AssetDocumentTypeRow[];
  canManage: boolean;
  error?: string;
};

type UpdateKind =
  | "modification"
  | "meter"
  | "status"
  | "project_transfer"
  | "compliance"
  | "other";

type UpdateOption = {
  id: string;
  title: string;
  description: string;
  icon: typeof Wrench;
  serviceRecordType?: string;
  updateType?: UpdateKind;
};

const UPDATE_OPTIONS: UpdateOption[] = [
  {
    id: "service",
    title: "Record Service",
    description:
      "Record a BC service or an external mechanic / workshop service in the same Asset history.",
    icon: Wrench,
    serviceRecordType: "service",
  },
  {
    id: "repair",
    title: "Repair",
    description: "Record an issue, diagnosis, fix, parts and optional Fleet Job linkage.",
    icon: Wrench,
    serviceRecordType: "repair",
  },
  {
    id: "inspection",
    title: "Inspection",
    description: "Record a structured inspection and findings against this asset.",
    icon: FileCheck2,
    serviceRecordType: "inspection",
  },
  {
    id: "modification",
    title: "Modification",
    description: "Record modifications, parts, supporting evidence and cost.",
    icon: PenTool,
    updateType: "modification",
  },
  {
    id: "compliance",
    title: "Compliance / Document",
    description: "Upload Rego, Insurance, CraneSafe, 10 Year, User Manual or another configured type.",
    icon: ShieldCheck,
    updateType: "compliance",
  },
  {
    id: "meter",
    title: "Odometer / Hours",
    description: "Update the current odometer or engine-hour reading and add it to history.",
    icon: Gauge,
    updateType: "meter",
  },
  {
    id: "status",
    title: "Status / Allocation",
    description: "Record a status or allocation change without editing unrelated master data.",
    icon: Settings2,
    updateType: "status",
  },
  {
    id: "project_transfer",
    title: "Project Transfer",
    description: "Move the asset to a project / crew and retain the project movement history.",
    icon: Truck,
    updateType: "project_transfer",
  },
  {
    id: "other",
    title: "Other Update",
    description: "Record another operational event in the permanent asset history.",
    icon: CalendarCheck2,
    updateType: "other",
  },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function assetLabel(type: AssetType, asset: AssetRecord) {
  const code = type === "vehicle" ? asset.vehicle_id : asset.asset_id;
  const rego = type === "vehicle" ? asset.vehicle_rego : asset.rego;
  const makeModel = [asset.make, asset.model].map(clean).filter(Boolean).join(" ");
  return [clean(code), makeModel, clean(rego)].filter(Boolean).join(" - ");
}

function projectLabel(project: ProjectOption) {
  const number = clean(project.project_number);
  const name = clean(project.name);
  return number ? `${number} · ${name}` : name;
}

function crewLabel(crew: CrewOption) {
  return [crew.crew_number, crew.crew_name, crew.leading_hand]
    .map(clean)
    .filter(Boolean)
    .join(" - ");
}

function isCurrentProject(project: ProjectOption) {
  return !["completed", "closed", "archived", "inactive"].includes(
    clean(project.status).toLowerCase(),
  );
}

export function UpdateAssetForm({
  initialAssetType = "vehicle",
  initialAssetId = "",
}: {
  initialAssetType?: AssetType;
  initialAssetId?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [assetType, setAssetType] = useState<AssetType>(initialAssetType);
  const [assetId, setAssetId] = useState(initialAssetId);
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedOption, setSelectedOption] = useState<UpdateOption | null>(null);

  const [eventDate, setEventDate] = useState(today());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [odometerKm, setOdometerKm] = useState("");
  const [engineHours, setEngineHours] = useState("");
  const [status, setStatus] = useState("");
  const [project, setProject] = useState("");
  const [crew, setCrew] = useState("");
  const [supplier, setSupplier] = useState("");
  const [cost, setCost] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [createFinanceRecord, setCreateFinanceRecord] = useState(false);
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [documentDate, setDocumentDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);

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

      return fetch(url, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [supabase],
  );

  const fetchBootstrap = useCallback(async () => {
    const response = await apiFetch("/api/assets/bootstrap");
    const payload = (await response.json()) as BootstrapPayload;

    if (!response.ok) {
      throw new Error(payload.error || "Assets could not be loaded.");
    }
    if (!payload.canManage) {
      throw new Error(
        "Administrator or Asset Manager access is required to update assets.",
      );
    }

    return payload;
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;

    void fetchBootstrap()
      .then((payload) => {
        if (!cancelled) {
          setBootstrap(payload);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Assets could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchBootstrap]);

  const assets = useMemo(() => {
    const rows: Array<{ type: AssetType; asset: AssetRecord; label: string }> = [
      ...(bootstrap?.vehicles ?? []).map((asset) => ({
        type: "vehicle" as const,
        asset,
        label: assetLabel("vehicle", asset),
      })),
      ...(bootstrap?.plant ?? []).map((asset) => ({
        type: "plant" as const,
        asset,
        label: assetLabel("plant", asset),
      })),
    ];

    const query = assetSearch.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) =>
      [row.label, row.type].join(" ").toLowerCase().includes(query),
    );
  }, [assetSearch, bootstrap]);

  const selectedAsset = useMemo(() => {
    if (!assetId) return null;
    const rows = assetType === "vehicle" ? bootstrap?.vehicles : bootstrap?.plant;
    return rows?.find((asset) => asset.id === assetId) ?? null;
  }, [assetId, assetType, bootstrap]);

  const currentProjects = useMemo(
    () =>
      (bootstrap?.projects ?? [])
        .filter(isCurrentProject)
        .sort((a, b) => projectLabel(a).localeCompare(projectLabel(b))),
    [bootstrap],
  );

  const crewOptions = useMemo(
    () =>
      (bootstrap?.crews ?? [])
        .filter((row) => row.active !== false)
        .map((row) => ({
          id: row.id,
          value: crewLabel(row),
          label: crewLabel(row),
        }))
        .filter((row) => Boolean(row.value))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [bootstrap],
  );

  const documentTypes = useMemo(
    () =>
      (bootstrap?.documentTypes ?? []).filter(
        (row) => row.applies_to === "both" || row.applies_to === assetType,
      ),
    [assetType, bootstrap],
  );

  const selectedDocumentType = useMemo(
    () => documentTypes.find((row) => row.id === documentTypeId) ?? null,
    [documentTypeId, documentTypes],
  );

  const namingPreview = useMemo(() => {
    if (!selectedAsset || !selectedDocumentType || !file) return "";

    try {
      return buildAssetDocumentFileName({
        documentType: selectedDocumentType,
        assetType,
        asset: selectedAsset,
        documentDate: documentDate || eventDate,
        expiryDate: expiryDate || null,
        supplier: supplier || null,
        invoiceNumber: invoiceNumber || null,
        originalFileName: file.name,
      });
    } catch (previewError) {
      return previewError instanceof Error
        ? previewError.message
        : "Filename preview unavailable";
    }
  }, [
    assetType,
    documentDate,
    eventDate,
    expiryDate,
    file,
    invoiceNumber,
    selectedAsset,
    selectedDocumentType,
    supplier,
  ]);

  function chooseAsset(type: AssetType, id: string) {
    const rows = type === "vehicle" ? bootstrap?.vehicles : bootstrap?.plant;
    const nextAsset = rows?.find((asset) => asset.id === id) ?? null;

    setAssetType(type);
    setAssetId(id);
    setSelectedOption(null);
    setDocumentTypeId("");
    setStatus(
      clean(type === "vehicle" ? nextAsset?.status : nextAsset?.asset_status),
    );
    setProject(clean(nextAsset?.project));
    setCrew(clean(nextAsset?.crew));
    setError("");
  }

  function chooseUpdate(option: UpdateOption) {
    if (!assetId) {
      setError("Select an asset first.");
      return;
    }

    if (option.serviceRecordType) {
      router.push(
        `/assets/services/new?assetType=${assetType}&assetId=${assetId}&recordType=${option.serviceRecordType}`,
      );
      return;
    }

    setSelectedOption(option);
    setTitle(option.title);
    setError("");
  }

  async function submitUpdate() {
    if (!selectedOption?.updateType || !selectedAsset) return;
    if (!title.trim()) {
      setError("Enter the update title / summary.");
      return;
    }

    if (file && !documentTypeId) {
      setError("Select the configured document type for the attachment.");
      return;
    }
if (file && file.size > 4.3 * 1024 * 1024) {
  setError(
    `The selected file is ${(file.size / 1024 / 1024).toFixed(
      1,
    )} MB. The current server upload path supports files up to approximately 4.5 MB.`,
  );
  return;
}
    setSaving(true);
    setError("");

    try {
      const formData = new FormData();
      formData.set(
        "payload",
        JSON.stringify({
          assetType,
          assetId,
          updateType: selectedOption.updateType,
          eventDate,
          title: title.trim(),
          description: description.trim() || null,
          supplier: supplier.trim() || null,
          cost: cost ? Number(cost) : null,
          odometerKm: odometerKm ? Number(odometerKm) : null,
          engineHours: engineHours ? Number(engineHours) : null,
          status: status.trim() || null,
          project: project.trim() || null,
          crew: crew.trim() || null,
          documentTypeId: documentTypeId || null,
          documentDate: documentDate || eventDate,
          expiryDate: expiryDate || null,
          invoiceNumber: invoiceNumber.trim() || null,
          createFinanceRecord,
        }),
      );

      if (file) formData.set("file", file);

const response = await apiFetch("/api/assets/updates", {
  method: "POST",
  body: formData,
});

const responseText = await response.text();

let payload: {
  error?: string;
} = {};

if (responseText) {
  try {
    payload = JSON.parse(responseText) as {
      error?: string;
    };
  } catch {
    payload = {};
  }
}

if (!response.ok) {
  if (response.status === 413) {
    throw new Error(
      "The attached file is too large to upload through TTTracker's current server route. Files above approximately 4.5 MB need to use the direct SharePoint upload workflow.",
    );
  }

  throw new Error(
    payload.error ||
      responseText ||
      "Asset update could not be saved.",
  );
}

      router.push(
        assetType === "vehicle"
          ? `/assets/vehicles/${assetId}`
          : `/assets/plant/${assetId}`,
      );
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Asset update could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 size={30} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/assets"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to Assets
        </Link>

        <div className="mt-5 flex items-start gap-4">
          <div className="rounded-2xl bg-blue-700 p-3 text-white">
            <Settings2 size={23} />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Assets & Fleet
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              Update Asset
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Find the vehicle or plant once, choose what happened, then TTTracker
              records the change in the permanent Asset history.
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-black text-slate-950">1. Select Asset</h2>
          <p className="mt-1 text-sm text-slate-500">
            Search by Asset ID, registration, make or model.
          </p>
        </div>

        <div className="p-5">
          <label className="relative block">
            <Search size={17} className="absolute left-3 top-3.5 text-slate-400" />
            <input
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="Search LV001, S380CUR, Ranger, MC001..."
              className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
            {assets.map((row) => {
              const active = row.type === assetType && row.asset.id === assetId;
              return (
                <button
                  key={`${row.type}-${row.asset.id}`}
                  type="button"
                  onClick={() => chooseAsset(row.type, row.asset.id)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className={`rounded-xl p-2.5 ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {row.type === "vehicle" ? <Truck size={18} /> : <HardHat size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">
                      {row.label || row.asset.id}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.type === "vehicle" ? "Vehicle" : "Plant"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {selectedAsset ? (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="font-black text-slate-950">2. What are you updating?</h2>
            <p className="mt-1 text-sm text-slate-500">
              Selected: <span className="font-black text-slate-800">{assetLabel(assetType, selectedAsset)}</span>
            </p>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {UPDATE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = selectedOption?.id === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => chooseUpdate(option)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    active
                      ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100"
                      : "border-slate-200 hover:-translate-y-0.5 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={20} className={active ? "text-blue-700" : "text-slate-400"} />
                  <div className="mt-3 font-black text-slate-950">{option.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{option.description}</div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {selectedAsset && selectedOption?.updateType ? (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="font-black text-slate-950">3. {selectedOption.title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              This update will be added to the Asset history timeline.
            </p>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date">
                <Input type="date" value={eventDate} onChange={setEventDate} />
              </Field>
              <Field label="Update title / summary">
                <Input value={title} onChange={setTitle} />
              </Field>
            </div>

            <Field label="Details">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="input resize-y"
                placeholder="Describe what changed, what was completed and anything that needs follow-up."
              />
            </Field>

            {selectedOption.updateType === "meter" ? (
              <div className="grid gap-4 md:grid-cols-2">
                {assetType === "vehicle" ? (
                  <Field label="Current odometer (km)">
                    <Input type="number" value={odometerKm} onChange={setOdometerKm} />
                  </Field>
                ) : (
                  <Field label="Current engine hours">
                    <Input type="number" value={engineHours} onChange={setEngineHours} />
                  </Field>
                )}
              </div>
            ) : null}

            {selectedOption.updateType === "status" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="New status">
                  <Input
                    value={status}
                    onChange={setStatus}
                    placeholder="Enter status..."
                  />
                </Field>

                <Field label="Crew / allocation">
                  <select
                    value={crew}
                    onChange={(event) => setCrew(event.target.value)}
                    className="input"
                  >
                    <option value="">Unassigned</option>
                    {crewOptions.map((row) => (
                      <option key={row.id} value={row.value}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}

            {selectedOption.updateType === "project_transfer" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Project">
                  <select
                    value={project}
                    onChange={(event) => setProject(event.target.value)}
                    className="input"
                  >
                    <option value="">No project</option>
                    {currentProjects.map((row) => (
                      <option key={row.id} value={row.name}>
                        {projectLabel(row)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Crew">
                  <select
                    value={crew}
                    onChange={(event) => setCrew(event.target.value)}
                    className="input"
                  >
                    <option value="">Unassigned</option>
                    {crewOptions.map((row) => (
                      <option key={row.id} value={row.value}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Supplier / workshop">
                <Input value={supplier} onChange={setSupplier} />
              </Field>
              <Field label="Cost inc GST">
                <Input type="number" value={cost} onChange={setCost} />
              </Field>
              <Field label="Invoice number">
                <Input value={invoiceNumber} onChange={setInvoiceNumber} />
              </Field>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start gap-3">
                <Upload size={19} className="mt-0.5 text-slate-400" />
                <div>
                  <div className="font-black text-slate-900">Supporting Document</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Optional. Select a configured document type so naming, SharePoint placement and superseding are automatic.
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Document type">
                  <select
                    value={documentTypeId}
                    onChange={(event) => setDocumentTypeId(event.target.value)}
                    className="input"
                  >
                    <option value="">No attachment / select type</option>
                    {documentTypes.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} ({row.code})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="File">
                  <input
                    type="file"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    className="input"
                  />
                </Field>

                {selectedDocumentType?.date_requirement === "document_date" ||
                selectedDocumentType?.date_requirement === "document_and_expiry" ? (
                  <Field label="Completion / document date">
                    <Input type="date" value={documentDate} onChange={setDocumentDate} />
                  </Field>
                ) : null}

                {selectedDocumentType?.date_requirement === "expiry_date" ||
                selectedDocumentType?.date_requirement === "document_and_expiry" ? (
                  <Field label="Expiry / due date">
                    <Input type="date" value={expiryDate} onChange={setExpiryDate} />
                  </Field>
                ) : null}
              </div>

              {namingPreview ? (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">Controlled filename preview</div>
                  <div className="mt-1 break-all font-mono text-sm font-black text-blue-900">{namingPreview}</div>
                </div>
              ) : null}
            </div>

            {Number(cost || 0) > 0 ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <input
                  type="checkbox"
                  checked={createFinanceRecord}
                  onChange={(event) => setCreateFinanceRecord(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-black text-emerald-900">Create linked Finance invoice draft</span>
                  <span className="mt-1 block text-xs leading-5 text-emerald-800">
                    The cost will appear in the Asset Spend tab while Finance keeps its normal review/payment workflow.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="flex justify-end border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={() => void submitUpdate()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Settings2 size={16} />}
                Save Asset Update
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          box-shadow: 0 0 0 2px rgb(219 234 254);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-800">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="input"
    />
  );
}
