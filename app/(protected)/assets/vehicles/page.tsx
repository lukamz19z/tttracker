import { Plus, Wrench } from "lucide-react";
import {
  ActionButton,
  DetailGrid,
  FilterBar,
  FilterInput,
  FilterSelect,
  KpiCard,
  PageHeader,
  PageShell,
  RegisterList,
  StatusBadge,
} from "../components";
import { ModeToggle, RecordActions } from "../record-actions";

type Vehicle = {
  id: string;
  rego: string;
  assetId: string;
  category: string;
  vehicle: string;
  site: string;
  nextService: string;
  regoExpiry: string;
  insuranceExpiry: string;
  status: string;
  tone: "emerald" | "amber" | "rose" | "blue";
};

const vehicles: Vehicle[] = [
  {
    id: "lv002",
    rego: "S334CMP",
    assetId: "LV002",
    category: "Light Vehicle",
    vehicle: "Toyota Hilux Dual Cab",
    site: "Depot",
    nextService: "10 Oct 2025",
    regoExpiry: "21 Jun 2026",
    insuranceExpiry: "30 Sep 2026",
    status: "Rego Due",
    tone: "amber",
  },
  {
    id: "lv004",
    rego: "S384CTL",
    assetId: "LV004",
    category: "Light Vehicle",
    vehicle: "Toyota Hilux Dual Cab",
    site: "Lobs Hole",
    nextService: "19 Feb 2026",
    regoExpiry: "22 Mar 2027",
    insuranceExpiry: "30 Sep 2026",
    status: "In Use",
    tone: "emerald",
  },
  {
    id: "hv003",
    rego: "XS13CF",
    assetId: "HV003",
    category: "Heavy Vehicle",
    vehicle: "Western Star Prime Mover",
    site: "Maragle",
    nextService: "08 Oct 2026",
    regoExpiry: "14 Apr 2027",
    insuranceExpiry: "30 Sep 2026",
    status: "Available",
    tone: "blue",
  },
  {
    id: "tr005",
    rego: "YO02DN",
    assetId: "TR005",
    category: "Trailer",
    vehicle: "Semi Trailer",
    site: "Depot",
    nextService: "15 Dec 2024",
    regoExpiry: "11 Jun 2026",
    insuranceExpiry: "N/A",
    status: "Review",
    tone: "rose",
  },
];

export default function AssetsVehiclesPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Vehicles"
        description="Light vehicles, heavy vehicles and trailers in one readable register. The important day-to-day fields are rego, service, insurance, site allocation and current status."
        actions={
          <>
            <ActionButton href="/assets/maintenance/new" variant="secondary" icon={<Wrench size={16} />}>
              Raise Job
            </ActionButton>
            <ActionButton href="/assets/vehicles/new" icon={<Plus size={16} />}>
              Add Vehicle
            </ActionButton>
            <ModeToggle />
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Light Vehicles" value="2" detail="utes and site vehicles" tone="blue" />
        <KpiCard label="Heavy Vehicles" value="1" detail="trucks and prime movers" tone="emerald" />
        <KpiCard label="Trailers" value="1" detail="registered trailers" tone="amber" />
        <KpiCard label="Needs Review" value="2" detail="rego, service or insurance" tone="rose" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search rego, ID, make, VIN..." />
        <FilterSelect label="Category" options={["All categories", "Light Vehicle", "Heavy Vehicle", "Trailer"]} />
        <FilterSelect label="Site" options={["All sites", "Depot", "Lobs Hole", "Maragle"]} />
        <FilterSelect label="Status" options={["All statuses", "Available", "In Use", "Rego Due", "Review"]} />
      </FilterBar>

      <RegisterList
        title="Vehicle Register"
        description="Designed to work on iPad in the field while still giving a full desktop register."
        items={vehicles}
        getKey={(vehicle) => vehicle.id}
        columns={[
          {
            label: "Vehicle",
            render: (vehicle) => (
              <div>
                <p className="font-semibold text-slate-950">{vehicle.assetId}</p>
                <p className="mt-1 text-slate-600">{vehicle.vehicle}</p>
              </div>
            ),
          },
          { label: "Rego", render: (vehicle) => vehicle.rego },
          { label: "Category", render: (vehicle) => vehicle.category },
          { label: "Site", render: (vehicle) => vehicle.site },
          { label: "Next Service", render: (vehicle) => vehicle.nextService },
          { label: "Rego Expiry", render: (vehicle) => vehicle.regoExpiry },
          { label: "Insurance", render: (vehicle) => vehicle.insuranceExpiry },
          {
            label: "Status",
            render: (vehicle) => <StatusBadge label={vehicle.status} tone={vehicle.tone} />,
          },
          {
            label: "Actions",
            render: (vehicle) => (
              <RecordActions
                recordType="vehicle"
                recordLabel={`${vehicle.assetId} ${vehicle.rego}`}
              />
            ),
          },
        ]}
        renderMobile={(vehicle) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">
                  {vehicle.assetId} / {vehicle.rego}
                </p>
                <p className="mt-1 text-sm text-slate-600">{vehicle.vehicle}</p>
              </div>
              <StatusBadge label={vehicle.status} tone={vehicle.tone} />
            </div>
            <DetailGrid
              items={[
                { label: "Category", value: vehicle.category },
                { label: "Site", value: vehicle.site },
                { label: "Service", value: vehicle.nextService },
                { label: "Rego", value: vehicle.regoExpiry },
              ]}
            />
            <RecordActions
              recordType="vehicle"
              recordLabel={`${vehicle.assetId} ${vehicle.rego}`}
            />
          </div>
        )}
      />
    </PageShell>
  );
}
