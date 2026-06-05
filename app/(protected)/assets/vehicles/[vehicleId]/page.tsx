import {
  ArrowLeft,
  Calendar,
  Car,
  ClipboardCheck,
  FileText,
  Pencil,
  Wrench,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import {
  ActionButton,
  DetailGrid,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../../components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "slate";

type VehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  project: string | null;
  crew: string | null;
  status: string | null;
  year: string | null;
  style: string | null;
  owner: string | null;
  vin_number: string | null;
  last_service: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  next_service_due: string | null;
  next_service_km: number | null;
  next_inspection_due: string | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  off_hire_date: string | null;
  superseded_by: string | null;
  inactive_reason: string | null;
  ehub: boolean | null;
  dashcam: boolean | null;
  alert_button: boolean | null;
  fuel_card: boolean | null;
  notes: string | null;
  created_at: string | null;
};

type VehicleDocument = {
  id: string;
  document_type: string | null;
  file_name: string | null;
  file_url: string | null;
  storage_path: string | null;
  created_at: string | null;
};

type ServiceHistory = {
  id: string;
  record_type: string | null;
  service_date: string | null;
  inspection_date: string | null;
  service_type: string | null;
  inspection_type: string | null;
  supplier: string | null;
  invoice_number: string | null;
  invoice_cost: number | null;
  work_completed: string | null;
  invoice_notes: string | null;
  next_service_due: string | null;
  next_inspection_due: string | null;
  document_url: string | null;
  document_name: string | null;
  created_at: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "N/A";
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "N/A";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getTone(status: string | null | undefined): Tone {
  const value = clean(status);

  if (value === "Available" || value === "Active") return "emerald";
  if (value === "In Use" || value === "On Hire") return "blue";
  if (
    value === "Off Hire" ||
    value === "Inactive" ||
    value === "Retired" ||
    value === "Superseded" ||
    value === "Not Hired"
  ) {
    return "rose";
  }

  return "amber";
}

function makeModel(vehicle: VehicleAsset | null) {
  if (!vehicle) return "Vehicle Detail";

  return [vehicle.make, vehicle.model]
    .map(clean)
    .filter((value) => value !== "N/A")
    .join(" ");
}

function ImportantDateCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{helper}</p>
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-slate-500 shadow-sm">
        {icon}
      </div>
      <p className="font-bold text-slate-800">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  );
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: vehicle } = await supabase
    .from("vehicle_assets")
    .select("*")
    .eq("id", vehicleId)
    .single<VehicleAsset>();

  const { data: documents } = await supabase
    .from("vehicle_documents")
    .select("*")
    .eq("vehicle_asset_id", vehicleId)
    .order("created_at", { ascending: false })
    .returns<VehicleDocument[]>();

  const { data: serviceHistory } = await supabase
    .from("vehicle_service_history")
    .select("*")
    .eq("vehicle_asset_id", vehicleId)
    .order("created_at", { ascending: false })
    .returns<ServiceHistory[]>();

  if (!vehicle) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Vehicle Record"
          title="Vehicle not found"
          description="This vehicle could not be found in the register."
          actions={
            <ActionButton
              href="/assets/vehicles"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back to Vehicles
            </ActionButton>
          }
        />
      </PageShell>
    );
  }

  const isTrailer = clean(vehicle.category).toLowerCase() === "trailer";

  const vehicleTitle =
    clean(vehicle.vehicle_id) !== "N/A"
      ? `${clean(vehicle.vehicle_id)} - ${
          makeModel(vehicle) || clean(vehicle.vehicle_rego)
        }`
      : makeModel(vehicle) || clean(vehicle.vehicle_rego);

  const basicDetailItems = [
    { label: "Vehicle ID", value: clean(vehicle.vehicle_id) },
    { label: "Rego", value: clean(vehicle.vehicle_rego) },
    { label: "Category", value: clean(vehicle.category) },
    { label: "Make", value: clean(vehicle.make) },
    { label: "Model", value: clean(vehicle.model) },
    { label: "Year", value: clean(vehicle.year) },
    ...(isTrailer ? [] : [{ label: "Style", value: clean(vehicle.style) }]),
    { label: "VIN / Chassis Number", value: clean(vehicle.vin_number) },
    {
      label: "Status",
      value: (
        <StatusBadge label={clean(vehicle.status)} tone={getTone(vehicle.status)} />
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Vehicle Record"
        title={vehicleTitle}
        description="Full asset profile with registration, allocation, documents, service history and future prestart history."
        actions={
          <>
            <ActionButton
              href="/assets/vehicles"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Back
            </ActionButton>

            <ActionButton
              href={`/assets/vehicles/${vehicleId}/edit`}
              icon={<Pencil size={16} />}
            >
              Edit
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Calendar size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Key Dates
                </h2>
                <p className="text-sm text-slate-600">
                  Important expiry and service information.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <ImportantDateCard
                label="Rego Expiry"
                value={formatDate(vehicle.rego_expiry)}
                helper="Registration renewal date"
              />

              {!isTrailer && (
                <ImportantDateCard
                  label="Insurance Expiry"
                  value={formatDate(vehicle.insurance_expiry)}
                  helper="Insurance renewal date"
                />
              )}

              <ImportantDateCard
                label={isTrailer ? "Next Inspection" : "Last Service"}
                value={
                  isTrailer
                    ? formatDate(vehicle.next_inspection_due)
                    : formatDate(vehicle.last_service)
                }
                helper={
                  isTrailer
                    ? "Trailer inspection due"
                    : "Most recent recorded service"
                }
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Car size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Basic Asset Details
                </h2>
                <p className="text-sm text-slate-600">
                  Main register and fleet identification details.
                </p>
              </div>
            </div>

            <DetailGrid items={basicDetailItems} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Allocation Details
            </h2>

            <div className="mt-5">
              <DetailGrid
                items={[
                  { label: "Project Allocation", value: clean(vehicle.project) },
                  { label: "Crew Allocation", value: clean(vehicle.crew) },
                ]}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Registration & Ownership
            </h2>

            <div className="mt-5">
              <DetailGrid
                items={[
                  { label: "Owner", value: clean(vehicle.owner) },
                  { label: "Rego Expiry", value: formatDate(vehicle.rego_expiry) },
                  ...(isTrailer
                    ? []
                    : [
                        {
                          label: "Insurance Expiry",
                          value: formatDate(vehicle.insurance_expiry),
                        },
                      ]),
                  {
                    label: isTrailer ? "Next Inspection" : "Last Service",
                    value: isTrailer
                      ? formatDate(vehicle.next_inspection_due)
                      : formatDate(vehicle.last_service),
                  },
                  ...(!isTrailer
                    ? [
                        {
                          label: "Next Service Due",
                          value: formatDate(vehicle.next_service_due),
                        },
                        {
                          label: "Next Service KM",
                          value:
                            vehicle.next_service_km === null ||
                            vehicle.next_service_km === undefined
                              ? "N/A"
                              : `${vehicle.next_service_km.toLocaleString()} km`,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Hire Details</h2>

            <div className="mt-5">
              <DetailGrid
                items={[
                  { label: "Hired?", value: yesNo(vehicle.hired) },
                  {
                    label: "Hired From",
                    value: vehicle.hired ? clean(vehicle.hired_from) : "N/A",
                  },
                  {
                    label: "Hire Term",
                    value: vehicle.hired ? clean(vehicle.hire_term) : "N/A",
                  },
                  {
                    label: "Off Hire Date",
                    value: formatDate(vehicle.off_hire_date),
                  },
                  {
                    label: "Superseded By",
                    value: clean(vehicle.superseded_by),
                  },
                  {
                    label: "Inactive Reason",
                    value: clean(vehicle.inactive_reason),
                  },
                ]}
              />
            </div>
          </section>

          {!isTrailer && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">
                Vehicle Setup
              </h2>

              <div className="mt-5">
                <DetailGrid
                  items={[
                    { label: "eHub Fitted", value: yesNo(vehicle.ehub) },
                    { label: "Dashcam Fitted", value: yesNo(vehicle.dashcam) },
                    {
                      label: "Alert Button Fitted",
                      value: yesNo(vehicle.alert_button),
                    },
                    {
                      label: "Fuel Card Issued",
                      value: yesNo(vehicle.fuel_card),
                    },
                  ]}
                />
              </div>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <FileText size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Documents</h2>
                <p className="text-sm text-slate-600">
                  Standard folders: Risk Assessment, Rego, Insurance, Service and
                  Other.
                </p>
              </div>
            </div>

            {documents && documents.length > 0 ? (
              <div className="space-y-3">
                {documents.map((document) => (
                  <a
                    key={document.id}
                    href={document.file_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-white"
                  >
                    <p className="text-sm font-bold text-slate-900">
                      {clean(document.document_type)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {clean(document.file_name)}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      Uploaded {formatDate(document.created_at)}
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<FileText size={18} />}
                title="No documents uploaded"
                description="Risk assessment, rego, insurance, service and other documents will appear here once attached."
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Wrench size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {isTrailer ? "Inspection History" : "Service History"}
                </h2>
                <p className="text-sm text-slate-600">
                  {isTrailer
                    ? "Trailer inspections, defects and repairs."
                    : "Vehicle services, repairs and invoice records."}
                </p>
              </div>
            </div>

            {serviceHistory && serviceHistory.length > 0 ? (
              <div className="space-y-3">
                {serviceHistory.map((record) => (
                  <div
                    key={record.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-950">
                          {clean(record.service_type || record.inspection_type)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(record.service_date || record.inspection_date)}
                        </p>
                      </div>

                      {record.document_url && (
                        <a
                          href={record.document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                        >
                          Invoice
                        </a>
                      )}
                    </div>

                    <p className="mt-3 text-sm text-slate-700">
                      {clean(record.work_completed)}
                    </p>

                    {record.invoice_notes ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {record.invoice_notes}
                      </p>
                    ) : null}

                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <p>Supplier: {clean(record.supplier)}</p>
                      <p>Invoice: {clean(record.invoice_number)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyCard
                icon={<Wrench size={18} />}
                title={
                  isTrailer
                    ? "No inspection history yet"
                    : "No service history yet"
                }
                description={
                  isTrailer
                    ? "Trailer inspection records will appear here once asset updates are submitted."
                    : "Service records, invoices, work completed and next service notes will appear here once asset updates are submitted."
                }
              />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <ClipboardCheck size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Prestart History
                </h2>
                <p className="text-sm text-slate-600">
                  Future vehicle prestart records.
                </p>
              </div>
            </div>

            <EmptyCard
              icon={<ClipboardCheck size={18} />}
              title="Prestart history coming later"
              description="Daily checks, reported defects, driver comments and sign-offs will appear here once prestarts are added."
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Calendar size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Notes</h2>
                <p className="text-sm text-slate-600">General asset notes.</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {clean(vehicle.notes)}
            </div>
          </section>
        </div>
      </section>
    </PageShell>
  );
}