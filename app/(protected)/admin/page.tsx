import Link from "next/link";
import {
  ArrowRight,
  LayoutDashboard,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";

export default function AdminPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Admin
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Admin Centre
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Manage people, crews, permissions and core system access from one
            place.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <AdminCard
            icon={<Users size={23} />}
            title="People"
            description="Employee profiles, PPE sizing, login accounts, website and mobile roles, crew allocation and project access."
            href="/admin/people"
            primary
          />

          <AdminCard
            icon={<UsersRound size={23} />}
            title="Crews"
            description="Create crews, assign leading hands and manage active crew structures."
            href="/admin/crews"
          />

          <AdminCard
            icon={<ShieldCheck size={23} />}
            title="Roles & Access"
            description="Review system permissions, project access and elevated administrative roles."
            href="/admin/people"
          />

          <AdminCard
            icon={<LayoutDashboard size={23} />}
            title="System Overview"
            description="Return to the main TTTracker dashboard and review operational activity."
            href="/"
          />
        </section>

        <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="font-bold text-blue-950">People is now the source of truth</h2>
          <p className="mt-1 text-sm leading-6 text-blue-800">
            Users and Employees have been combined. New staff should be created
            through People so their profile, PPE sizes, crew, mobile access and
            website permissions stay linked.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function AdminCard({
  icon,
  title,
  description,
  href,
  primary = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group block rounded-3xl border p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        primary
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div
        className={`inline-flex rounded-2xl p-3 ${
          primary
            ? "bg-white/10 text-white"
            : "bg-slate-100 text-slate-700"
        }`}
      >
        {icon}
      </div>

      <h2 className="mt-5 text-xl font-bold">{title}</h2>
      <p
        className={`mt-2 text-sm leading-6 ${
          primary ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {description}
      </p>

      <div
        className={`mt-6 inline-flex items-center gap-2 text-sm font-semibold ${
          primary ? "text-white" : "text-slate-900"
        }`}
      >
        Open
        <ArrowRight
          size={16}
          className="transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}
