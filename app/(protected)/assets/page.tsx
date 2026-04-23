"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type AssetTab =
  | "overview"
  | "plant"
  | "vehicles"
  | "equipment"
  | "compliance"
  | "prestarts";

type KpiCard = {
  title: string;
  value: string;
  subtitle: string;
  accent: "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";
};

function getAccentClasses(accent: KpiCard["accent"]) {
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
    case "violet":
      return {
        card: "from-violet-50 to-white border-violet-100",
        bar: "bg-violet-500",
      };
    case "rose":
      return {
        card: "from-rose-50 to-white border-rose-100",
        bar: "bg-rose-500",
      };
    default:
      return {
        card: "from-slate-50 to-white border-slate-200",
        bar: "bg-slate-500",
      };
  }
}

function KpiTile({ title, value, subtitle, accent }: KpiCard) {
  const styles = getAccentClasses(accent);

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${styles.card}`}
    >
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
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
        active
          ? "bg-slate-900 text-white shadow"
          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function ModuleCard({
  title,
  description,
  href,
  accent,
}: {
  title: string;
  description: string;
  href: string;
  accent: "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";
}) {
  const styles = getAccentClasses(accent);

  return (
    <Link href={href}>
      <div
        className={`h-full rounded-2xl border bg-gradient-to-br p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${styles.card}`}
      >
        <div className={`mb-4 h-1.5 w-14 rounded-full ${styles.bar}`} />
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </Link>
  );
}

function SimpleListCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; meta: string; tone?: "red" | "amber" | "blue" | "green" | "slate" }>;
}) {
  const toneClasses = {
    red: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            No items yet.
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium text-slate-900">{item.name}</div>
                <div className="text-sm text-slate-500 mt-1">{item.meta}</div>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                  toneClasses[item.tone || "slate"]
                }`}
              >
                {item.tone || "slate"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AssetsDashboardPage() {
  const [activeTab, setActiveTab] = useState<AssetTab>("overview");

  const overviewKpis = useMemo<KpiCard[]>(
    () => [
      {
        title: "Total Assets",
        value: "0",
        subtitle: "Plant, vehicles and equipment records",
        accent: "blue",
      },
      {
        title: "Active Assets",
        value: "0",
        subtitle: "Currently in service",
        accent: "emerald",
      },
      {
        title: "Expiring Soon",
        value: "0",
        subtitle: "Items due in the next 30 days",
        accent: "amber",
      },
      {
        title: "Workshop Items",
        value: "0",
        subtitle: "Assets currently under repair or service",
        accent: "rose",
      },
      {
        title: "Open Prestarts",
        value: "0",
        subtitle: "Future crew prestart submissions",
        accent: "violet",
      },
      {
        title: "Compliance Health",
        value: "0%",
        subtitle: "Placeholder until records are loaded",
        accent: "slate",
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Asset Manager
            </h1>
            <p className="mt-2 text-slate-600">
              Store plant and equipment records, track history, manage compliance,
              and prepare for future prestart submissions.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              href="/assets/plant"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Open Plant Register
            </Link>
            <Link
              href="/assets/compliance"
              className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
            >
              Compliance View
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex gap-2 flex-wrap">
          <TabButton
            active={activeTab === "overview"}
            label="Overview"
            onClick={() => setActiveTab("overview")}
          />
          <TabButton
            active={activeTab === "plant"}
            label="Plant"
            onClick={() => setActiveTab("plant")}
          />
          <TabButton
            active={activeTab === "vehicles"}
            label="Vehicles"
            onClick={() => setActiveTab("vehicles")}
          />
          <TabButton
            active={activeTab === "equipment"}
            label="Equipment"
            onClick={() => setActiveTab("equipment")}
          />
          <TabButton
            active={activeTab === "compliance"}
            label="Compliance"
            onClick={() => setActiveTab("compliance")}
          />
          <TabButton
            active={activeTab === "prestarts"}
            label="Prestarts"
            onClick={() => setActiveTab("prestarts")}
          />
        </div>
      </div>

      {activeTab === "overview" && (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {overviewKpis.map((kpi) => (
              <KpiTile key={kpi.title} {...kpi} />
            ))}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              title="Core Asset Modules"
              subtitle="Start with the main parts of the asset management system."
            />

            <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              <ModuleCard
                title="Plant Register"
                description="Track cranes, EWPs, telehandlers, excavators, skid steers and major plant."
                href="/assets/plant"
                accent="blue"
              />
              <ModuleCard
                title="Vehicles"
                description="Manage light vehicles, trucks, trailers, registration and service history."
                href="/assets/vehicles"
                accent="emerald"
              />
              <ModuleCard
                title="Equipment"
                description="Track tools, generators, welders, lifting gear and supporting equipment."
                href="/assets/equipment"
                accent="violet"
              />
              <ModuleCard
                title="Compliance"
                description="Monitor inspections, insurance, registration, test & tag and expiry alerts."
                href="/assets/compliance"
                accent="amber"
              />
              <ModuleCard
                title="Prestarts"
                description="Future home for team-member prestarts and daily plant condition reporting."
                href="/assets/prestarts"
                accent="rose"
              />
              <ModuleCard
                title="Documents"
                description="Future home for manuals, certificates and SharePoint-linked asset folders."
                href="/assets/documents"
                accent="slate"
              />
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            <SimpleListCard
              title="Upcoming Compliance Items"
              items={[
                {
                  name: "No records yet",
                  meta: "This panel can later show rego, inspections, servicing and insurance due dates.",
                  tone: "amber",
                },
              ]}
            />

            <SimpleListCard
              title="Recent Asset Activity"
              items={[
                {
                  name: "No history yet",
                  meta: "This panel can later show repairs, services, breakdowns and uploaded documents.",
                  tone: "blue",
                },
              ]}
            />
          </div>
        </>
      )}

      {activeTab === "plant" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <SectionHeader
            title="Plant"
            subtitle="Heavy plant and major equipment register."
            action={
              <div className="flex gap-2 flex-wrap">
                <Link
                  href="/assets/plant"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Open Full Register
                </Link>
                <button className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium">
                  Add Plant
                </button>
              </div>
            }
          />

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiTile
              title="Plant Items"
              value="0"
              subtitle="Tracked heavy plant assets"
              accent="blue"
            />
            <KpiTile
              title="In Service"
              value="0"
              subtitle="Available for operations"
              accent="emerald"
            />
            <KpiTile
              title="In Workshop"
              value="0"
              subtitle="Under maintenance or repair"
              accent="rose"
            />
            <KpiTile
              title="Due Soon"
              value="0"
              subtitle="Plant compliance approaching"
              accent="amber"
            />
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-slate-500">
            Start here with fields like Asset ID, description, make/model, serial, location,
            service due, inspection due, and uploaded records.
          </div>
        </div>
      )}

      {activeTab === "vehicles" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <SectionHeader
            title="Vehicles"
            subtitle="Light vehicles, trucks and trailers."
            action={
              <div className="flex gap-2 flex-wrap">
                <Link
                  href="/assets/vehicles"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Open Vehicles
                </Link>
                <button className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium">
                  Add Vehicle
                </button>
              </div>
            }
          />

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiTile title="Vehicles" value="0" subtitle="Fleet vehicles tracked" accent="blue" />
            <KpiTile title="Rego Due" value="0" subtitle="Upcoming registration expiries" accent="amber" />
            <KpiTile title="Insurance Due" value="0" subtitle="Upcoming insurance renewals" accent="violet" />
            <KpiTile title="Service Due" value="0" subtitle="Vehicles needing service" accent="rose" />
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-slate-500">
            This section can later run like your existing vehicle spreadsheet but in TTTracker.
          </div>
        </div>
      )}

      {activeTab === "equipment" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <SectionHeader
            title="Equipment"
            subtitle="Tools, lifting gear and supporting site equipment."
            action={
              <div className="flex gap-2 flex-wrap">
                <Link
                  href="/assets/equipment"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Open Equipment
                </Link>
                <button className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium">
                  Add Equipment
                </button>
              </div>
            }
          />

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiTile title="Equipment Items" value="0" subtitle="Tracked support equipment" accent="blue" />
            <KpiTile title="Test & Tag Due" value="0" subtitle="Electrical items nearing due date" accent="amber" />
            <KpiTile title="Lifting Gear Due" value="0" subtitle="Inspection renewals approaching" accent="violet" />
            <KpiTile title="Out of Service" value="0" subtitle="Tagged out or unavailable" accent="rose" />
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-slate-500">
            Good place later for chain blocks, slings, generators, welders and test equipment.
          </div>
        </div>
      )}

      {activeTab === "compliance" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <SectionHeader
            title="Compliance"
            subtitle="Expiry tracking, inspections and alerts."
            action={
              <Link
                href="/assets/compliance"
                className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
              >
                Open Compliance
              </Link>
            }
          />

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiTile title="Due in 7 Days" value="0" subtitle="Highest priority items" accent="rose" />
            <KpiTile title="Due in 30 Days" value="0" subtitle="Upcoming compliance items" accent="amber" />
            <KpiTile title="Current" value="0" subtitle="Assets currently compliant" accent="emerald" />
            <KpiTile title="Overdue" value="0" subtitle="Needs urgent action" accent="violet" />
          </div>

          <div className="grid xl:grid-cols-2 gap-6">
            <SimpleListCard
              title="Overdue / Critical"
              items={[
                {
                  name: "No items yet",
                  meta: "Overdue inspections and expired records can appear here later.",
                  tone: "red",
                },
              ]}
            />
            <SimpleListCard
              title="Due Soon"
              items={[
                {
                  name: "No items yet",
                  meta: "This list can show assets due in 7, 14 or 30 days.",
                  tone: "amber",
                },
              ]}
            />
          </div>
        </div>
      )}

      {activeTab === "prestarts" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <SectionHeader
            title="Prestarts"
            subtitle="Future workflow for team-member equipment prestarts."
            action={
              <Link
                href="/assets/prestarts"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Future Prestarts Page
              </Link>
            }
          />

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiTile title="Submitted Today" value="0" subtitle="Daily prestart submissions" accent="blue" />
            <KpiTile title="Open Issues" value="0" subtitle="Reported faults from prestarts" accent="rose" />
            <KpiTile title="Reviewed" value="0" subtitle="Manager/mechanic reviewed" accent="emerald" />
            <KpiTile title="Outstanding" value="0" subtitle="Still needing review" accent="amber" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-lg font-semibold text-slate-900">Future idea</h3>
            <div className="mt-3 text-sm leading-7 text-slate-600">
              Team members can eventually submit daily prestarts into TTTracker for vehicles,
              plant and equipment. That can feed issues directly to the mechanic, create a
              history trail per asset, and support live compliance visibility.
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">
            Later this tab can include a register of submitted prestarts, issue flags,
            asset condition trends and mechanic review status.
          </div>
        </div>
      )}
    </div>
  );
}