import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Anchor, ClipboardCheck, FileChartColumnIncreasing, Settings2, ShipWheel, Truck, Waves } from "lucide-react";

const cards = [
  { title: "Lift Studies", href: "/lift-engineering/studies", description: "Project-scoped lift plans, calculations, reviews and issued reports.", icon: ClipboardCheck },
  { title: "Crane Profiles", href: "/lift-engineering/library/cranes", description: "Crane revisions, geometry, hooks and attachments.", icon: Truck },
  { title: "Crane Configurations", href: "/lift-engineering/library/configurations", description: "Configuration revisions, counterweight and boom state.", icon: Settings2 },
  { title: "Rigging Library", href: "/lift-engineering/library/rigging", description: "Engineering rigging items, WLL and mass revisions.", icon: Anchor },
  { title: "Rigging Arrangements", href: "/lift-engineering/library/arrangements", description: "Reusable arrangements with derived component tare.", icon: ShipWheel },
  { title: "Tower Templates", href: "/lift-engineering/library/templates", description: "Reusable lift sequence templates and revisions.", icon: Waves },
  { title: "Load Charts", href: "/lift-engineering/library/charts", description: "Manufacturer chart records and rated-capacity points.", icon: FileChartColumnIncreasing },
  { title: "Calculation Settings", href: "/lift-engineering/library/settings", description: "Versioned methodology factors and calculation settings.", icon: Settings2 },
];

export default function LiftEngineeringPage() {
  return <AppShell><main className="mx-auto max-w-7xl space-y-6 p-4 md:p-7">
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Engineering Library</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Lift Engineering</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Reusable crane, configuration, rigging, template and chart records support project-scoped Lift Studies. Study revisions retain their own calculation snapshots.</p></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ title, href, description, icon: Icon }) => <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"><span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-700"><Icon size={21}/></span><h2 className="mt-4 font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-600">{description}</p><span className="mt-4 inline-block text-sm font-bold text-blue-700">Open library →</span></Link>)}</section>
    <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Methodology state:</strong> The supplied workbook/PDF were not present in this repository. The calculation engine is versioned and supports parity tests from supplied checkpoints, but calculations must remain marked for engineering review until the source method is reconciled. Outrigger reactions are reference-only; no Romanello/CSP calculation is approved.</aside>
  </main></AppShell>;
}
