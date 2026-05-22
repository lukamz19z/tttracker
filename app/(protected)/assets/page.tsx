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
  tone: "red" | "amber" | "green" | "blue" | "violet" | "slate";
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
    case "violet":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function KpiTile({ title, value, subtitle, accent }: KpiCard) {
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${accentClasses(accent)}`}>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
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
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm break-inside-avoid">
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

function QuickAction({
  label,
  href,
  description,
}: {
  label: string;
  href: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <p className="font-bold text-slate-900">{label}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </Link>
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
      detail: "Vehicle and road-registered plant expiry dates will appear here.",
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

  const serviceItems: PanelItem[] = [
    {
      asset: "No service records loaded",
      detail: "Service due dates, service hours and workshop planning will appear here.",
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

  const missingDocumentItems: PanelItem[] = [
    {
      asset: "No missing documents loaded",
      detail: "Missing load charts, risk assessments, manuals and certificates will appear here.",
      status: "Pending data",
      tone: "slate",
    },
  ];

  const upcomingActions: PanelItem[] = [
    {
      asset: "Review asset compliance register",
      detail: "Check rego, insurance, service due and inspection expiry dates.",
      status: "Action",
      tone: "blue",
    },
    {
      asset: "Upload asset documents",
      detail: "Attach load charts, insurance, rego, service records and plant risk assessments.",
      status: "Action",
      tone: "amber",
    },
    {
      asset: "Set up prestart issue tracking",
      detail: "Flagged prestart notes will feed directly into this dashboard.",
      status: "Next",
      tone: "violet",
    },
  ];

  function handlePrintPdf() {
    window.print();
  }

  return (
    <div className="space-y-6 p-6 md:p-8 print:bg-white print:p-4">
      <style jsx global>{`
        @media print {
          aside,
          nav,
          header,
          .no-print {
            display: none !important;
          }

          main {
            width: 100% !important;
          }

          body {
            background: white !important;
          }

          .print\\:shadow-none {
            box-shadow: none !important;
          }

          .break-inside-avoid {
            break-inside: avoid;
          }
        }
      `}</style>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm print:shadow-none">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
              Asset Manager
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Assets Overview
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Compliance dashboard for rego expiry, insurance expiry, service due,
              prestart issues, open defects and missing asset documents.
            </p>
          </div>

          <div className="no-print flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Print / Save PDF
            </button>

            <Link
              href="/assets/compliance"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Compliance View
            </Link>
          </div>
        </div>
      </section>

      <section className="no-print grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <QuickAction
          label="+ Add Plant"
          href="/assets/plant"
          description="Cranes, telehandlers, EWPs and major plant."
        />
        <QuickAction
          label="+ Add Vehicle"
          href="/assets/vehicles"
          description="Hiluxes, trucks, trailers and road vehicles."
        />
        <QuickAction
          label="+ Add Equipment"
          href="/assets/equipment"
          description="Tools, rigging, lifting gear and site equipment."
        />
        <QuickAction
          label="+ Upload Compliance"
          href="/assets/compliance"
          description="Rego, insurance, CraneSafe and inspection records."
        />
        <QuickAction
          label="+ Log Defect"
          href="/assets/defects-maintenance"
          description="Breakdowns, repairs and maintenance issues."
        />
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
          title="Asset Availability"
          value={0}
          subtitle="Available assets compared with total assets."
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

      <section className="grid gap-6 xl:grid-cols-3">
        <ControlPanel
          title="Rego Expiry"
          subtitle="Vehicles, trailers and road-registered plant."
          items={regoItems}
        />

        <ControlPanel
          title="Insurance Expiry"
          subtitle="Insurance, policies and hired plant records."
          items={insuranceItems}
        />

        <ControlPanel
          title="Service Due"
          subtitle="Service dates, service hours and workshop planning."
          items={serviceItems}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <ControlPanel
          title="Flagged Issues from Prestarts"
          subtitle="Faults and notes raised by operators during daily checks."
          items={prestartIssues}
        />

        <ControlPanel
          title="Open Defects / Maintenance"
          subtitle="Repairs, breakdowns and assets requiring attention."
          items={defectItems}
        />

        <ControlPanel
          title="Missing Documents"
          subtitle="Load charts, risk assessments, manuals and certificates."
          items={missingDocumentItems}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ControlPanel
          title="Upcoming Actions"
          subtitle="Reminders and next steps that need attention."
          items={upcomingActions}
        />

        <ControlPanel
          title="Inspection / CraneSafe Expiry"
          subtitle="Major plant inspections, CraneSafe and annual inspection records."
          items={[
            {
              asset: "No inspection records loaded",
              detail:
                "CraneSafe, annual inspections and plant inspection expiries will appear here.",
              status: "Pending data",
              tone: "slate",
            },
          ]}
        />
      </section>
    </div>
  );
}