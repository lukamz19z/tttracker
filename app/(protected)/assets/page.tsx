"use client";

import Link from "next/link";

type Accent = "blue" | "emerald" | "amber" | "rose" | "violet" | "slate";

type KpiCard = {
  title: string;
  value: string;
  subtitle: string;
  accent: Accent;
};

type PanelItem = {
  asset: string;
  detail: string;
  status: string;
  tone: "red" | "amber" | "green" | "blue" | "slate";
};

function accentClasses(accent: Accent) {
  switch (accent) {
    case "blue":
      return "border-blue-100 bg-blue-50";
    case "emerald":
      return "border-emerald-100 bg-emerald-50";
    case "amber":
      return "border-amber-100 bg-amber-50";
    case "rose":
      return "border-rose-100 bg-rose-50";
    case "violet":
      return "border-violet-100 bg-violet-50";
    default:
      return "border-slate-200 bg-white";
  }
}

function badgeClasses(tone: PanelItem["tone"]) {
  switch (tone) {
    case "red":
      return "bg-rose-100 text-rose-700";
    case "amber":
      return "bg-amber-100 text-amber-700";
    case "green":
      return "bg-emerald-100 text-emerald-700";
    case "blue":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function KpiTile({ title, value, subtitle, accent }: KpiCard) {
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${accentClasses(accent)}`}>
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-600">{subtitle}</div>
    </div>
  );
}

function DonutCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: number;
  subtitle: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-5">
        <div
          className="grid h-24 w-24 place-items-center rounded-full"
          style={{
            background: `conic-gradient(#0f172a ${value * 3.6}deg, #e2e8f0 0deg)`,
          }}
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-white">
            <span className="text-xl font-bold text-slate-900">{value}%</span>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function ControlPanel({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: PanelItem[];
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {items.length}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item, index) => (
          <div
            key={`${item.asset}-${index}`}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{item.asset}</div>
                <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
              </div>

              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses(
                  item.tone,
                )}`}
              >
                {item.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AssetsDashboardPage() {
  const kpis: KpiCard[] = [
    {
      title: "Total Assets",
      value: "0",
      subtitle: "Plant, vehicles and equipment",
      accent: "blue",
    },
    {
      title: "Compliant Assets",
      value: "0",
      subtitle: "Ready for site use",
      accent: "emerald",
    },
    {
      title: "Expiring Soon",
      value: "0",
      subtitle: "Due within 30 days",
      accent: "amber",
    },
    {
      title: "Expired Items",
      value: "0",
      subtitle: "Requires urgent action",
      accent: "rose",
    },
    {
      title: "Flagged Prestarts",
      value: "0",
      subtitle: "Issues raised by operators",
      accent: "violet",
    },
    {
      title: "Open Defects",
      value: "0",
      subtitle: "Maintenance or repair required",
      accent: "slate",
    },
  ];

  const regoItems: PanelItem[] = [
    {
      asset: "No rego expiries loaded",
      detail: "Vehicle and plant registration expiries will appear here.",
      status: "Pending data",
      tone: "slate",
    },
  ];

  const insuranceItems: PanelItem[] = [
    {
      asset: "No insurance records loaded",
      detail: "Insurance and policy expiry dates will appear here.",
      status: "Pending data",
      tone: "slate",
    },
  ];

  const prestartIssues: PanelItem[] = [
    {
      asset: "No flagged prestarts",
      detail: "Operator-reported faults from daily prestarts will appear here.",
      status: "Clear",
      tone: "green",
    },
  ];

  const defectItems: PanelItem[] = [
    {
      asset: "No open defects",
      detail: "Open maintenance items, breakdowns and repairs will appear here.",
      status: "Clear",
      tone: "green",
    },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
              Asset Manager
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Assets Overview
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Track plant, vehicles, equipment, compliance expiries, insurance,
              prestart issues and maintenance defects from one control dashboard.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/assets/plant"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open Plant
            </Link>
            <Link
              href="/assets/compliance"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Compliance View
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiTile key={kpi.title} {...kpi} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <DonutCard
          title="Compliance Health"
          value={0}
          subtitle="Calculated from current documents and expiries."
        />
        <DonutCard
          title="Plant Availability"
          value={0}
          subtitle="In-service assets compared with total plant."
        />
        <DonutCard
          title="Prestart Health"
          value={0}
          subtitle="Daily submissions without flagged issues."
        />
        <DonutCard
          title="Maintenance Closure"
          value={0}
          subtitle="Closed defects compared with total raised."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ControlPanel
          title="Rego Expiry"
          subtitle="Vehicles, trucks, trailers and road-registered plant."
          items={regoItems}
        />

        <ControlPanel
          title="Insurance Expiry"
          subtitle="Insurance, policies and hired plant compliance records."
          items={insuranceItems}
        />

        <ControlPanel
          title="Flagged Issues from Prestarts"
          subtitle="Faults raised by operators during daily checks."
          items={prestartIssues}
        />

        <ControlPanel
          title="Open Defects / Maintenance"
          subtitle="Repairs, breakdowns and assets requiring attention."
          items={defectItems}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <ControlPanel
          title="Inspection / CraneSafe Expiry"
          subtitle="Major plant inspections and CraneSafe records."
          items={[
            {
              asset: "No inspection records loaded",
              detail: "CraneSafe, annual inspections and plant inspections will appear here.",
              status: "Pending data",
              tone: "slate",
            },
          ]}
        />

        <ControlPanel
          title="Service Due"
          subtitle="Service dates, service hours and workshop planning."
          items={[
            {
              asset: "No service records loaded",
              detail: "Service due dates and service-hour triggers will appear here.",
              status: "Pending data",
              tone: "slate",
            },
          ]}
        />

        <ControlPanel
          title="Missing Documents"
          subtitle="Load charts, risk assessments, manuals and certificates."
          items={[
            {
              asset: "No missing documents loaded",
              detail: "Assets missing required documents will appear here.",
              status: "Pending data",
              tone: "slate",
            },
          ]}
        />
      </section>
    </div>
  );
}