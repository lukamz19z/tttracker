"use client";

import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  Plus,
  ReceiptText,
  Save,
  Trash2,
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

import { createSupabaseBrowser } from "@/lib/supabase";
import type { AssetType } from "@/lib/assets/types";

type VehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  status: string | null;
};

type PlantAsset = {
  id: string;
  asset_id: string | null;
  rego: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  asset_status: string | null;
};

type FleetJob = {
  id: string;
  job_number: string | null;
  asset_type: string | null;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  asset_label: string | null;
  status: string | null;
};

type BootstrapPayload = {
  vehicles: VehicleAsset[];
  plant: PlantAsset[];
  fleetJobs: FleetJob[];
  identity: {
    name: string;
    employeeId: string | null;
    role: string;
  };
  canManage: boolean;
  error?: string;
};

type IssueRow = {
  uiId: string;
  issue: string;
  diagnosis: string;
  rectification: string;
  partsUsed: string;
  labourHours: string;
  itemStatus: "resolved" | "monitor" | "unresolved";
};

function newIssue(): IssueRow {
  return {
    uiId: crypto.randomUUID(),
    issue: "",
    diagnosis: "",
    rectification: "",
    partsUsed: "",
    labourHours: "",
    itemStatus: "resolved",
  };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function vehicleLabel(asset: VehicleAsset) {
  return [
    clean(asset.vehicle_id),
    [clean(asset.make), clean(asset.model)].filter(Boolean).join(" "),
    clean(asset.vehicle_rego),
  ]
    .filter(Boolean)
    .join(" - ");
}

function plantLabel(asset: PlantAsset) {
  return [
    clean(asset.asset_id),
    [clean(asset.make), clean(asset.model)].filter(Boolean).join(" "),
    clean(asset.rego),
  ]
    .filter(Boolean)
    .join(" - ");
}

function today() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

type ServiceRecordType =
  | "service"
  | "repair"
  | "inspection"
  | "maintenance"
  | "breakdown";

function serviceRecordType(value: string | undefined): ServiceRecordType {
  if (
    value === "repair" ||
    value === "inspection" ||
    value === "maintenance" ||
    value === "breakdown"
  ) {
    return value;
  }

  return "service";
}

export function AssetServiceForm({
  initialAssetType = "vehicle",
  initialAssetId = "",
  initialRecordType = "service",
}: {
  initialAssetType?: AssetType;
  initialAssetId?: string;
  initialRecordType?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const initialType: AssetType =
    initialAssetType === "plant" ? "plant" : "vehicle";

  const [assetType, setAssetType] = useState<AssetType>(initialType);
  const [assetId, setAssetId] = useState(initialAssetId);
  const [recordType, setRecordType] = useState<ServiceRecordType>(
    serviceRecordType(initialRecordType),
  );
  const [serviceDate, setServiceDate] = useState(today());

  const [odometerKm, setOdometerKm] = useState("");
  const [engineHours, setEngineHours] = useState("");

  const [providerType, setProviderType] = useState<
    "internal" | "external"
  >("internal");
  const [providerName, setProviderName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [fleetJobId, setFleetJobId] = useState("");
  const [workOrderReference, setWorkOrderReference] = useState("");

  const [summary, setSummary] = useState("");
  const [workCompleted, setWorkCompleted] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [followUpActions, setFollowUpActions] = useState("");

  const [nextServiceDate, setNextServiceDate] = useState("");
  const [nextServiceKm, setNextServiceKm] = useState("");
  const [nextServiceHours, setNextServiceHours] = useState("");

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amountExGst, setAmountExGst] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [amountIncGst, setAmountIncGst] = useState("");
  const [serviceFile, setServiceFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [useServiceFileAsInvoice, setUseServiceFileAsInvoice] = useState(false);
  const [createFinanceRecord, setCreateFinanceRecord] = useState(true);

  const [issues, setIssues] = useState<IssueRow[]>([newIssue()]);

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
      throw new Error(
        payload.error || "Asset service setup could not be loaded.",
      );
    }

    if (!payload.canManage) {
      throw new Error(
        "Administrator or Asset Manager access is required to create service records.",
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
              : "Asset service setup could not be loaded.",
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

  const assetOptions = useMemo(
    () =>
      assetType === "vehicle"
        ? (bootstrap?.vehicles ?? []).map((asset) => ({
            id: asset.id,
            label: vehicleLabel(asset),
          }))
        : (bootstrap?.plant ?? []).map((asset) => ({
            id: asset.id,
            label: plantLabel(asset),
          })),
    [assetType, bootstrap],
  );

  const resolvedAssetId = useMemo(() => {
    if (assetId && assetOptions.some((asset) => asset.id === assetId)) {
      return assetId;
    }

    return assetOptions[0]?.id ?? "";
  }, [assetId, assetOptions]);

  const availableFleetJobs = useMemo(() => {
    const jobs = bootstrap?.fleetJobs ?? [];

    return jobs.filter((job) => {
      const linked =
        assetType === "vehicle"
          ? job.vehicle_asset_id === resolvedAssetId
          : job.plant_asset_id === resolvedAssetId;

      return linked;
    });
  }, [assetType, bootstrap, resolvedAssetId]);

  function patchIssue(uiId: string, patch: Partial<IssueRow>) {
    setIssues((current) =>
      current.map((issue) =>
        issue.uiId === uiId ? { ...issue, ...patch } : issue,
      ),
    );
  }

  function removeIssue(uiId: string) {
    setIssues((current) =>
      current.length === 1
        ? [newIssue()]
        : current.filter((issue) => issue.uiId !== uiId),
    );
  }

  async function submit() {
    if (!resolvedAssetId) {
      setError("Select the asset.");
      return;
    }

    if (providerType === "external" && !providerName.trim()) {
      setError("Enter the external mechanic / workshop name.");
      return;
    }

    if (providerType === "external" && !serviceFile) {
      setError(
        "Upload the external mechanic service report / workshop document.",
      );
      return;
    }

    if (!summary.trim()) {
      setError("Enter the service / repair summary.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const formData = new FormData();

      const payload = {
        assetType,
        assetId: resolvedAssetId,
        recordType,
        serviceDate,
        odometerKm: odometerKm ? Number(odometerKm) : null,
        engineHours: engineHours ? Number(engineHours) : null,
        providerType,
        providerName: providerName.trim() || null,
        supplier: supplier.trim() || null,
        fleetJobId: fleetJobId || null,
        workOrderReference: workOrderReference.trim() || null,
        summary: summary.trim(),
        workCompleted: workCompleted.trim() || null,
        recommendations: recommendations.trim() || null,
        followUpActions: followUpActions.trim() || null,
        nextServiceDate: nextServiceDate || null,
        nextServiceKm: nextServiceKm ? Number(nextServiceKm) : null,
        nextServiceHours: nextServiceHours
          ? Number(nextServiceHours)
          : null,
        invoiceNumber: invoiceNumber.trim() || null,
        amountExGst: amountExGst ? Number(amountExGst) : 0,
        gstAmount: gstAmount ? Number(gstAmount) : 0,
        amountIncGst: amountIncGst ? Number(amountIncGst) : 0,
        useServiceFileAsInvoice:
          providerType === "external" &&
          Boolean(serviceFile) &&
          !invoiceFile &&
          useServiceFileAsInvoice,
        createFinanceRecord,
        items: issues
          .filter((issue) => issue.issue.trim())
          .map((issue) => ({
            issue: issue.issue.trim(),
            diagnosis: issue.diagnosis.trim() || null,
            rectification: issue.rectification.trim() || null,
            partsUsed: issue.partsUsed.trim() || null,
            labourHours: issue.labourHours
              ? Number(issue.labourHours)
              : null,
            itemStatus: issue.itemStatus,
          })),
      };

      formData.set("payload", JSON.stringify(payload));

      if (serviceFile) {
        formData.set("serviceFile", serviceFile);
      }

      if (invoiceFile) {
        formData.set("invoiceFile", invoiceFile);
      }

      const response = await apiFetch("/api/assets/services/complete", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as {
        service?: { service_number?: string };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error || "Service record could not be completed.",
        );
      }

      router.push(
        assetType === "vehicle"
          ? `/assets/vehicles/${resolvedAssetId}`
          : `/assets/plant/${resolvedAssetId}`,
      );
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Service record could not be completed.",
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
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/assets/services"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to Service Register
        </Link>

        <div className="mt-5 flex items-start gap-4">
          <div className="rounded-2xl bg-slate-950 p-3 text-white">
            <Wrench size={24} />
          </div>

          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Assets & Fleet
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              Record Service / Repair
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Record BC-performed work or an external mechanic / workshop service
              in the same searchable Asset history. Internal work generates the
              BC service PDF; external work keeps the workshop document as the
              controlled service evidence.
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <FormSection
        number="01"
        title="Asset & Service Details"
        description="Select the asset and capture the meter reading when the work was completed."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Asset type">
            <select
              value={assetType}
              onChange={(event) => {
                setAssetType(event.target.value as AssetType);
                setAssetId("");
                setFleetJobId("");
              }}
              className="input"
            >
              <option value="vehicle">Vehicle</option>
              <option value="plant">Plant</option>
            </select>
          </Field>

          <Field label="Asset">
            <select
              value={resolvedAssetId}
              onChange={(event) => {
                setAssetId(event.target.value);
                setFleetJobId("");
              }}
              className="input"
            >
              {assetOptions.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Record type">
            <select
              value={recordType}
              onChange={(event) =>
                setRecordType(
                  serviceRecordType(event.target.value),
                )
              }
              className="input"
            >
              <option value="service">Service</option>
              <option value="repair">Repair</option>
              <option value="maintenance">Maintenance</option>
              <option value="inspection">Inspection</option>
              <option value="breakdown">Breakdown</option>
            </select>
          </Field>

          <Field label="Service / work date">
            <Input
              type="date"
              value={serviceDate}
              onChange={setServiceDate}
            />
          </Field>

          {assetType === "vehicle" ? (
            <Field label="Odometer (km)">
              <Input
                type="number"
                value={odometerKm}
                onChange={setOdometerKm}
              />
            </Field>
          ) : (
            <Field label="Engine hours">
              <Input
                type="number"
                value={engineHours}
                onChange={setEngineHours}
              />
            </Field>
          )}

          <Field label="Linked Fleet Job">
            <select
              value={fleetJobId}
              onChange={(event) => setFleetJobId(event.target.value)}
              className="input"
            >
              <option value="">No Fleet Job</option>
              {availableFleetJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.job_number || "Fleet Job"} ·{" "}
                  {job.asset_label || clean(job.status)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Who completed the work?">
            <select
              value={providerType}
              onChange={(event) =>
                setProviderType(
                  event.target.value === "external"
                    ? "external"
                    : "internal",
                )
              }
              className="input"
            >
              <option value="internal">BC Contracting / Internal</option>
              <option value="external">External Mechanic / Workshop</option>
            </select>
          </Field>

          {providerType === "external" ? (
            <>
              <Field label="Mechanic / workshop name">
                <Input
                  value={providerName}
                  onChange={setProviderName}
                  placeholder="e.g. Central Coast Mechanical"
                />
              </Field>

              <div className="lg:col-span-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <Field label="External service report / workshop document *">
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      setServiceFile(event.target.files?.[0] ?? null);
                      if (!event.target.files?.[0]) {
                        setUseServiceFileAsInvoice(false);
                      }
                    }}
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                  />
                </Field>
                <p className="mt-2 text-xs leading-5 text-blue-800">
                  This is the controlled evidence for the external service. TTTracker
                  renames it using the configured Service naming convention and stores
                  it under Service &amp; Repairs. It is not converted into a BC service
                  report.
                </p>
              </div>
            </>
          ) : null}

          <Field label="Work order / reference">
            <Input
              value={workOrderReference}
              onChange={setWorkOrderReference}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        number="02"
        title="Service Summary"
        description="This becomes the searchable headline in TTTracker and on the service record / supporting document."
      >
        <Field label="Summary">
          <Input
            value={summary}
            onChange={setSummary}
            placeholder="e.g. 20,000 km service and front brake inspection"
          />
        </Field>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Field label="Work completed">
            <TextArea
              value={workCompleted}
              onChange={setWorkCompleted}
              placeholder="General work completed..."
            />
          </Field>

          <Field label="Recommendations">
            <TextArea
              value={recommendations}
              onChange={setRecommendations}
              placeholder="Monitor, replace next service..."
            />
          </Field>

          <Field label="Follow-up actions">
            <TextArea
              value={followUpActions}
              onChange={setFollowUpActions}
              placeholder="Parts to order, Fleet Job follow-up..."
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        number="03"
        title="Issues, Findings & Fixes"
        description="Add as many issue lines as required. These remain searchable in TTTracker and are included on the BC PDF for internal work."
      >
        <div className="space-y-4">
          {issues.map((issue, index) => (
            <div
              key={issue.uiId}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-black text-slate-950">
                  Item {index + 1}
                </div>

                <button
                  type="button"
                  onClick={() => removeIssue(issue.uiId)}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                  aria-label={`Remove issue ${index + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Field label="Issue / finding">
                  <TextArea
                    value={issue.issue}
                    onChange={(value) =>
                      patchIssue(issue.uiId, { issue: value })
                    }
                    placeholder="What was identified?"
                  />
                </Field>

                <Field label="Diagnosis / cause">
                  <TextArea
                    value={issue.diagnosis}
                    onChange={(value) =>
                      patchIssue(issue.uiId, { diagnosis: value })
                    }
                    placeholder="What caused it / what was found?"
                  />
                </Field>

                <Field label="Fix / rectification">
                  <TextArea
                    value={issue.rectification}
                    onChange={(value) =>
                      patchIssue(issue.uiId, { rectification: value })
                    }
                    placeholder="What was repaired or changed?"
                  />
                </Field>

                <Field label="Parts / consumables used">
                  <TextArea
                    value={issue.partsUsed}
                    onChange={(value) =>
                      patchIssue(issue.uiId, { partsUsed: value })
                    }
                    placeholder="Filters, oil, pads, fittings..."
                  />
                </Field>

                <Field label="Labour hours">
                  <Input
                    type="number"
                    value={issue.labourHours}
                    onChange={(value) =>
                      patchIssue(issue.uiId, { labourHours: value })
                    }
                  />
                </Field>

                <Field label="Item outcome">
                  <select
                    value={issue.itemStatus}
                    onChange={(event) =>
                      patchIssue(issue.uiId, {
                        itemStatus: event.target.value as
                          | "resolved"
                          | "monitor"
                          | "unresolved",
                      })
                    }
                    className="input"
                  >
                    <option value="resolved">Resolved</option>
                    <option value="monitor">Monitor</option>
                    <option value="unresolved">Unresolved</option>
                  </select>
                </Field>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIssues((current) => [...current, newIssue()])}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
        >
          <Plus size={16} />
          Add Issue / Finding
        </button>
      </FormSection>

      <FormSection
        number="04"
        title="Next Service"
        description="Updating these values also updates the asset register so the next service is visible without opening any document."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Next service date">
            <Input
              type="date"
              value={nextServiceDate}
              onChange={setNextServiceDate}
            />
          </Field>

          {assetType === "vehicle" ? (
            <Field label="Next service km">
              <Input
                type="number"
                value={nextServiceKm}
                onChange={setNextServiceKm}
              />
            </Field>
          ) : (
            <Field label="Next service hours">
              <Input
                type="number"
                value={nextServiceHours}
                onChange={setNextServiceHours}
              />
            </Field>
          )}
        </div>
      </FormSection>

      <FormSection
        number="05"
        title={providerType === "external" ? "Workshop Documents & Cost" : "Invoice & Cost"}
        description={
          providerType === "external"
            ? "Keep the external service evidence under Service & Repairs. If there is an invoice, TTTracker can also store it under Invoices and link the cost into Finance."
            : "Optional. The invoice can be saved into the Asset SharePoint folder and linked into Finance without re-uploading it."
        }
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Supplier">
            <Input value={supplier} onChange={setSupplier} />
          </Field>

          <Field label="Invoice number">
            <Input value={invoiceNumber} onChange={setInvoiceNumber} />
          </Field>

          <Field label="Amount ex GST">
            <Input
              type="number"
              value={amountExGst}
              onChange={setAmountExGst}
            />
          </Field>

          <Field label="GST">
            <Input
              type="number"
              value={gstAmount}
              onChange={setGstAmount}
            />
          </Field>

          <Field label="Amount inc GST">
            <Input
              type="number"
              value={amountIncGst}
              onChange={setAmountIncGst}
            />
          </Field>

          <Field label="Invoice file (optional)">
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setInvoiceFile(nextFile);
                if (nextFile) {
                  setUseServiceFileAsInvoice(false);
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>

        {providerType === "external" && serviceFile && !invoiceFile ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <input
              type="checkbox"
              checked={useServiceFileAsInvoice}
              onChange={(event) =>
                setUseServiceFileAsInvoice(event.target.checked)
              }
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-black text-blue-900">
                This workshop document is also the invoice
              </span>
              <span className="mt-1 block text-xs leading-5 text-blue-800">
                TTTracker will keep the controlled service copy under Service &amp;
                Repairs and also place an invoice copy in the Asset Invoices folder.
              </span>
            </span>
          </label>
        ) : null}

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <input
            type="checkbox"
            checked={createFinanceRecord}
            onChange={(event) =>
              setCreateFinanceRecord(event.target.checked)
            }
            className="mt-1"
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-black text-emerald-900">
              <ReceiptText size={16} />
              Create linked Finance invoice draft
            </span>
            <span className="mt-1 block text-xs leading-5 text-emerald-800">
              Only creates a Finance record when a positive cost is entered.
              Finance retains its normal review/payment workflow.
            </span>
          </span>
        </label>
      </FormSection>

      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <ClipboardList size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black">
                Complete Service Record
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                {providerType === "internal"
                  ? "This creates the structured service history, generates the BC branded service PDF, uploads it to SharePoint and updates the next-service fields on the asset."
                  : "This creates the same structured service history, stores the external mechanic document as the controlled service evidence, and updates the next-service fields on the asset."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Save size={17} />
            )}
            Complete & Save Service Record
          </button>
        </div>
      </section>

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

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-4 border-b border-slate-200 bg-slate-50 p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white">
          {number}
        </div>
        <div>
          <h2 className="font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {description}
          </p>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
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

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
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

function TextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={4}
      className="input resize-y"
    />
  );
}
