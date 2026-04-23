"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type PlantStatus =
  | "Active"
  | "In Workshop"
  | "Standby"
  | "Out of Service"
  | "Hired";

type ComplianceState = "Current" | "Due Soon" | "Overdue" | "N/A";

type PlantAsset = {
  id: string;
  assetId: string;
  description: string;
  category: string;
  make: string;
  model: string;
  year: string;
  serialNumber: string;
  owner: string;
  siteAllocation: string;
  crew: string;
  status: PlantStatus;
  inUse: boolean;
  hired: boolean;
  lastService: string;
  nextService: string;
  riskAssessmentExpiry: string;
  craneSafeExpiry: string;
  insuranceExpiry: string;
  regoExpiry: string;
  link: string;
  notes: string;
};

type StatusFilter = "All" | PlantStatus;
type ComplianceFilter = "All" | ComplianceState;

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.ceil((target.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
}

function getComplianceState(dateStr: string): ComplianceState {
  const days = daysUntil(dateStr);
  if (days === null) return "N/A";
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due Soon";
  return "Current";
}

function getComplianceTone(state: ComplianceState) {
  switch (state) {
    case "Overdue":
      return "bg-rose-100 text-rose-700";
    case "Due Soon":
      return "bg-amber-100 text-amber-700";
    case "Current":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getStatusTone(status: PlantStatus) {
  switch (status) {
    case "Active":
      return "bg-emerald-100 text-emerald-700";
    case "In Workshop":
      return "bg-amber-100 text-amber-700";
    case "Standby":
      return "bg-blue-100 text-blue-700";
    case "Out of Service":
      return "bg-rose-100 text-rose-700";
    case "Hired":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getAccentClasses(accent: "blue" | "emerald" | "amber" | "rose" | "violet" | "slate") {
  switch (accent) {
    case "blue":
      return {
        card: "from-blue-50 to-white border-blue-100",
        bar: "bg-blue-500",
      };
    case "emerald":
      return {
        card: "from-emerald-50 to-white border-emerald-100",
        bar: "bg-emerald-500",
      };
    case "amber":
      return {
        card: "from-amber-50 to-white border-amber-100",
        bar: "bg-amber-500",
      };
    case "rose":
      return {
        card: "from-rose-50 to-white border-rose-100",
        bar: "bg-rose-500",
      };
    case "violet":
      return {
        card: "from-violet-50 to-white border-violet-100",
        bar: "bg-violet-500",
      };
    default:
      return {
        card: "from-slate-50 to-white border-slate-200",
        bar: "bg-slate-500",
      };
  }
}

function KpiTile({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent: "blue" | "emerald" | "amber" | "rose";
}) {
  const styles = getAccentClasses(accent);

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${styles.card}`}>
      <div className={`mb-4 h-1.5 w-14 rounded-full ${styles.bar}`} />
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
      <div className="mt-2 text-sm text-slate-600">{subtitle}</div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

const initialAssets: PlantAsset[] = [
  {
    id: "1",
    assetId: "PL-001",
    description: "Manitou MHT 10160",
    category: "Telehandler",
    make: "Manitou",
    model: "MHT 10160",
    year: "2021",
    serialNumber: "MHT10160-001",
    owner: "BC Contracting",
    siteAllocation: "Maragle",
    crew: "A&E Crew 1",
    status: "Active",
    inUse: true,
    hired: false,
    lastService: "2026-03-10",
    nextService: "2026-05-20",
    riskAssessmentExpiry: "2026-06-10",
    craneSafeExpiry: "2026-05-05",
    insuranceExpiry: "",
    regoExpiry: "",
    link: "",
    notes: "Primary telehandler on site",
  },
  {
    id: "2",
    assetId: "PL-002",
    description: "Franna Crane",
    category: "Crane",
    make: "Franna",
    model: "AT20",
    year: "2019",
    serialNumber: "FRN-AT20-114",
    owner: "BC Contracting",
    siteAllocation: "Yass",
    crew: "Lifting Crew",
    status: "In Workshop",
    inUse: false,
    hired: false,
    lastService: "2026-02-15",
    nextService: "2026-04-18",
    riskAssessmentExpiry: "2026-07-01",
    craneSafeExpiry: "2026-04-22",
    insuranceExpiry: "",
    regoExpiry: "",
    link: "",
    notes: "Workshop for hydraulic issue",
  },
  {
    id: "3",
    assetId: "PL-003",
    description: "Generator 45kVA",
    category: "Generator",
    make: "CAT",
    model: "DE45",
    year: "2018",
    serialNumber: "CAT-DE45-443",
    owner: "Hired",
    siteAllocation: "Maragle",
    crew: "Site Support",
    status: "Hired",
    inUse: true,
    hired: true,
    lastService: "2026-03-01",
    nextService: "2026-04-30",
    riskAssessmentExpiry: "2026-05-10",
    craneSafeExpiry: "",
    insuranceExpiry: "2026-04-28",
    regoExpiry: "",
    link: "",
    notes: "Hired unit for temporary power",
  },
  {
    id: "4",
    assetId: "PL-004",
    description: "Scissor Lift",
    category: "EWP",
    make: "JLG",
    model: "3246ES",
    year: "2020",
    serialNumber: "JLG-3246-09",
    owner: "BC Contracting",
    siteAllocation: "Depot",
    crew: "Workshop",
    status: "Standby",
    inUse: false,
    hired: false,
    lastService: "2026-01-20",
    nextService: "2026-08-20",
    riskAssessmentExpiry: "2026-06-30",
    craneSafeExpiry: "",
    insuranceExpiry: "",
    regoExpiry: "",
    link: "",
    notes: "Available at depot",
  },
];

export default function PlantPage() {
  const [assets] = useState<PlantAsset[]>(initialAssets);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [siteFilter, setSiteFilter] = useState("All");
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>("All");

  const sites = useMemo(() => {
    return ["All", ...Array.from(new Set(assets.map((a) => a.siteAllocation).filter(Boolean))).sort()];
  }, [assets]);

  const assetsWithCompliance = useMemo(() => {
    return assets.map((asset) => {
      const serviceState = getComplianceState(asset.nextService);
      const riskState = getComplianceState(asset.riskAssessmentExpiry);
      const craneState = getComplianceState(asset.craneSafeExpiry);

      const states: ComplianceState[] = [serviceState, riskState, craneState].filter(
        (s) => s !== "N/A",
      );

      let overall: ComplianceState = "N/A";
      if (states.includes("Overdue")) overall = "Overdue";
      else if (states.includes("Due Soon")) overall = "Due Soon";
      else if (states.includes("Current")) overall = "Current";

      return {
        ...asset,
        serviceState,
        riskState,
        craneState,
        overallComplianceState: overall,
      };
    });
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();

    return assetsWithCompliance.filter((asset) => {
      if (statusFilter !== "All" && asset.status !== statusFilter) return false;
      if (siteFilter !== "All" && asset.siteAllocation !== siteFilter) return false;
      if (complianceFilter !== "All" && asset.overallComplianceState !== complianceFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        asset.assetId,
        asset.description,
        asset.category,
        asset.make,
        asset.model,
        asset.serialNumber,
        asset.siteAllocation,
        asset.owner,
        asset.crew,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [assetsWithCompliance, search, statusFilter, siteFilter, complianceFilter]);

  const kpis = useMemo(() => {
    const totalPlant = assets.length;
    const inService = assets.filter((a) => a.status === "Active").length;
    const dueSoon = assetsWithCompliance.filter(
      (a) => a.overallComplianceState === "Due Soon",
    ).length;
    const overdue = assetsWithCompliance.filter(
      (a) => a.overallComplianceState === "Overdue",
    ).length;

    return { totalPlant, inService, dueSoon, overdue };
  }, [assets, assetsWithCompliance]);

  const reminderItems = useMemo(() => {
    const items: Array<{
      assetId: string;
      description: string;
      item: string;
      date: string;
      days: number | null;
      state: ComplianceState;
    }> = [];

    assets.forEach((asset) => {
      const checks = [
        { item: "Next Service", date: asset.nextService },
        { item: "Risk Assessment", date: asset.riskAssessmentExpiry },
        { item: "CraneSafe", date: asset.craneSafeExpiry },
      ];

      checks.forEach((check) => {
        const state = getComplianceState(check.date);
        if (state === "Current" || state === "N/A") return;

        items.push({
          assetId: asset.assetId,
          description: asset.description,
          item: check.item,
          date: check.date,
          days: daysUntil(check.date),
          state,
        });
      });
    });

    return items.sort((a, b) => {
      const aDays = a.days ?? 99999;
      const bDays = b.days ?? 99999;
      return aDays - bDays;
    });
  }, [assets]);

  const overdueItems = reminderItems.filter((item) => item.state === "Overdue").slice(0, 4);
  const dueSoonItems = reminderItems.filter((item) => item.state === "Due Soon").slice(0, 4);

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Plant Register</h1>
            <p className="mt-2 text-slate-600">
              Manage heavy plant, servicing, compliance and operational status.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              href="/assets"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Back to Assets
            </Link>
            <button className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">
              Add Plant
            </button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiTile
          title="Total Plant"
          value={String(kpis.totalPlant)}
          subtitle="tracked plant assets"
          accent="blue"
        />
        <KpiTile
          title="In Service"
          value={String(kpis.inService)}
          subtitle="currently operational"
          accent="emerald"
        />
        <KpiTile
          title="Due Soon"
          value={String(kpis.dueSoon)}
          subtitle="next 30 days"
          accent="amber"
        />
        <KpiTile
          title="Overdue"
          value={String(kpis.overdue)}
          subtitle="urgent action required"
          accent="rose"
        />
      </div>

      <div className="grid xl:grid-cols-[1.4fr_0.9fr] gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            title="Plant Register"
            subtitle="Search, filter and review current plant assets."
          />

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-4 gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search asset, make, model, serial, site..."
              className="xl:col-span-1 border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="border border-slate-300 rounded-2xl px-4 py-3 text-sm bg-white"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="In Workshop">In Workshop</option>
              <option value="Standby">Standby</option>
              <option value="Out of Service">Out of Service</option>
              <option value="Hired">Hired</option>
            </select>

            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="border border-slate-300 rounded-2xl px-4 py-3 text-sm bg-white"
            >
              {sites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>

            <select
              value={complianceFilter}
              onChange={(e) => setComplianceFilter(e.target.value as ComplianceFilter)}
              className="border border-slate-300 rounded-2xl px-4 py-3 text-sm bg-white"
            >
              <option value="All">All Compliance</option>
              <option value="Current">Current</option>
              <option value="Due Soon">Due Soon</option>
              <option value="Overdue">Overdue</option>
              <option value="N/A">N/A</option>
            </select>
          </div>

          <div className="mt-6 hidden xl:block overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Asset</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Category</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Make / Model</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Site</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Status</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Next Service</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">CraneSafe</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Risk Assess</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Compliance</th>
                  <th className="p-3 text-left text-sm font-semibold text-slate-700">Open</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="border-t hover:bg-slate-50">
                    <td className="p-3 align-top">
                      <div className="font-semibold text-slate-900">{asset.assetId}</div>
                      <div className="text-sm text-slate-500 mt-1">{asset.description}</div>
                    </td>

                    <td className="p-3 align-top text-sm text-slate-700">{asset.category}</td>

                    <td className="p-3 align-top">
                      <div className="text-sm font-medium text-slate-900">{asset.make}</div>
                      <div className="text-sm text-slate-500 mt-1">{asset.model}</div>
                    </td>

                    <td className="p-3 align-top">
                      <div className="text-sm text-slate-900">{asset.siteAllocation || "-"}</div>
                      <div className="text-xs text-slate-500 mt-1">{asset.crew || "-"}</div>
                    </td>

                    <td className="p-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusTone(
                          asset.status,
                        )}`}
                      >
                        {asset.status}
                      </span>
                    </td>

                    <td className="p-3 align-top">
                      <div className="text-sm text-slate-900">{asset.nextService || "-"}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {daysUntil(asset.nextService) !== null
                          ? `${daysUntil(asset.nextService)} days`
                          : "-"}
                      </div>
                    </td>

                    <td className="p-3 align-top">
                      <div className="text-sm text-slate-900">{asset.craneSafeExpiry || "-"}</div>
                    </td>

                    <td className="p-3 align-top">
                      <div className="text-sm text-slate-900">{asset.riskAssessmentExpiry || "-"}</div>
                    </td>

                    <td className="p-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getComplianceTone(
                          asset.overallComplianceState,
                        )}`}
                      >
                        {asset.overallComplianceState}
                      </span>
                    </td>

                    <td className="p-3 align-top">
                      <button className="inline-flex rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">
                        Open
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredAssets.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-slate-500">
                      No plant items match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 xl:hidden space-y-3">
            {filteredAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
                No plant items match your filters.
              </div>
            ) : (
              filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{asset.assetId}</div>
                      <div className="text-sm text-slate-500 mt-1">{asset.description}</div>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusTone(
                        asset.status,
                      )}`}
                    >
                      {asset.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-slate-500">Category</div>
                      <div className="font-medium text-slate-900 mt-1">{asset.category}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Make / Model</div>
                      <div className="font-medium text-slate-900 mt-1">
                        {asset.make} {asset.model}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Site</div>
                      <div className="font-medium text-slate-900 mt-1">
                        {asset.siteAllocation || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Compliance</div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getComplianceTone(
                            asset.overallComplianceState,
                          )}`}
                        >
                          {asset.overallComplianceState}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button className="inline-flex rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">
                      Open
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              title="Compliance Reminder"
              subtitle="Constant reminder of the most urgent upcoming items."
            />

            <div className="mt-6 space-y-5">
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-rose-700">Overdue</h3>
                  <span className="rounded-full bg-rose-100 text-rose-700 px-3 py-1 text-xs font-medium">
                    {overdueItems.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {overdueItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      No overdue items.
                    </div>
                  ) : (
                    overdueItems.map((item, index) => (
                      <div
                        key={`${item.assetId}-${item.item}-${index}`}
                        className="rounded-xl border border-rose-200 bg-rose-50 p-4"
                      >
                        <div className="font-semibold text-slate-900">
                          {item.assetId} — {item.description}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          {item.item} expired on {item.date}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-amber-700">Due Soon</h3>
                  <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-medium">
                    {dueSoonItems.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {dueSoonItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      No items due soon.
                    </div>
                  ) : (
                    dueSoonItems.map((item, index) => (
                      <div
                        key={`${item.assetId}-${item.item}-${index}`}
                        className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                      >
                        <div className="font-semibold text-slate-900">
                          {item.assetId} — {item.description}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          {item.item} due {item.date}
                          {item.days !== null ? ` (${item.days} days)` : ""}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              title="Future Asset Profile"
              subtitle="What each plant item can expand into later."
            />

            <div className="mt-4 text-sm leading-7 text-slate-600">
              Each plant asset can later open into its own profile page with service history,
              repairs, uploaded documents, prestarts, photos, costs and a SharePoint folder link.
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Suggested next page</div>
              <div className="mt-2 text-sm text-slate-600">
                <code className="rounded bg-white px-2 py-1 border text-slate-800">
                  app/(protected)/assets/plant/[assetId]/page.tsx
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}